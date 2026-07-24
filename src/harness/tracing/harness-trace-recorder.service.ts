import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { HarnessStepName } from '../contracts/harness-step.types';
import { HarnessStepContractRegistryService } from '../runtime/harness-step-contract.registry';
import {
  HarnessStateProjectionService,
  type HarnessProjectParams,
} from '../runtime/state-projection.service';
import { getAtPath } from '../lib/dso-path.util';
import type {
  HarnessOnFailureRetrofitParams,
  HarnessTrace,
  HarnessTraceCorrelationMeta,
  HarnessTraceFinalStatus,
  HarnessTraceStep,
} from './harness-trace.types';
import { harnessTraceCorrelationMetaFromRuntime } from './harness-otel-correlation.util';

@Injectable()
export class HarnessTraceRecorderService {
  private readonly logger = new Logger(HarnessTraceRecorderService.name);
  private readonly traces = new Map<string, HarnessTrace>();

  constructor(
    @Optional() private readonly projection?: HarnessStateProjectionService,
    @Optional() private readonly contracts?: HarnessStepContractRegistryService,
  ) {}

  /**
   * 在插入新 trace 前按 FIFO 淘汰最旧条目，防止 `HARNESS_RECORD_TRACE=1` 长进程内存膨胀。
   * `HARNESS_TRACE_MAX_ENTRIES`：正整数为上限；未设或 ≤0 表示不限制。
   */
  private evictTracesIfOverLimitBeforeInsert(): void {
    const raw = process.env.HARNESS_TRACE_MAX_ENTRIES?.trim();
    const max = raw == null || raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(max) || max < 1) return;
    while (this.traces.size >= max) {
      const oldest = this.traces.keys().next().value;
      if (oldest === undefined) break;
      this.traces.delete(oldest);
    }
  }

  ensureTrace(traceId: string, requestId: string, meta?: HarnessTraceCorrelationMeta): HarnessTrace {
    let t = this.traces.get(traceId);
    if (!t) {
      this.evictTracesIfOverLimitBeforeInsert();
      const mergedMeta = this.mergeCorrelationMeta(undefined, meta);
      t = {
        traceId,
        requestId,
        startedAt: new Date().toISOString(),
        finalStatus: 'DONE',
        steps: [],
        ...(mergedMeta ? { meta: mergedMeta } : {}),
      };
      this.traces.set(traceId, t);
    } else {
      const mergedMeta = this.mergeCorrelationMeta(t.meta, meta);
      if (mergedMeta) {
        t.meta = mergedMeta;
      }
    }
    return t;
  }

  private mergeCorrelationMeta(
    existing: HarnessTraceCorrelationMeta | undefined,
    incoming: HarnessTraceCorrelationMeta | undefined,
  ): HarnessTraceCorrelationMeta | undefined {
    const out: HarnessTraceCorrelationMeta = { ...(existing ?? {}) };
    const runId = incoming?.evaluationRunId?.trim();
    if (runId && !out.evaluationRunId) out.evaluationRunId = runId;
    const otelTraceId = incoming?.otelTraceId?.trim();
    if (otelTraceId && !out.otelTraceId) out.otelTraceId = otelTraceId;
    const otelSpanId = incoming?.otelSpanId?.trim();
    if (otelSpanId && !out.otelSpanId) out.otelSpanId = otelSpanId;
    return Object.keys(out).length > 0 ? out : undefined;
  }

  appendStep(traceId: string, step: HarnessTraceStep): void {
    const t = this.traces.get(traceId);
    if (!t) return;
    if (t.endedAt != null) {
      this.logger.warn(
        `[HarnessTraceRecorder] appendStep ignored: trace ${traceId} already finalized at ${t.endedAt} (finalStatus=${t.finalStatus}, step=${String(step.step)})`,
      );
      return;
    }
    t.steps.push(step);
  }

  finalize(traceId: string, status: HarnessTraceFinalStatus): void {
    const t = this.traces.get(traceId);
    if (!t) return;
    t.finalStatus = status;
    t.endedAt = new Date().toISOString();
  }

  /**
   * 编排成功/业务终态收口：仅当 trace 尚未写入 `endedAt` 时闭合（harness 失败路径已 `finalize` 的不覆盖）。
   */
  finalizeIfStillOpen(traceId: string, status: HarnessTraceFinalStatus): void {
    const t = this.traces.get(traceId);
    if (!t || t.endedAt != null) return;
    t.finalStatus = status;
    t.endedAt = new Date().toISOString();
  }

  getTrace(traceId: string): HarnessTrace | undefined {
    return this.traces.get(traceId);
  }

  /** 调试 / 运维：当前内存中的 traceId 列表（插入顺序）。 */
  listTraceIds(): readonly string[] {
    return [...this.traces.keys()];
  }

  /** 测试用 */
  clearTrace(traceId: string): void {
    this.traces.delete(traceId);
  }

  /**
   * `HARNESS_TRACE_MODE=on-failure`：不依赖成功路径上的 append，在失败点按 DSO 现场逆向合成闭合 trace。
   * 合成结果写入内存 Map（便于 `exportClosedTraceIfConfigured` 复用），且带 `retrofit` 元数据。
   */
  retrofitTrajectoryOnFailure(params: HarnessOnFailureRetrofitParams): HarnessTrace {
    const now = new Date().toISOString();
    const dso = params.dsoSnapshot as DecisionState;
    const finalStatus: HarnessTraceFinalStatus =
      params.runStatus === 'BLOCKED'
        ? 'BLOCKED'
        : params.runStatus === 'PASSED' || params.runStatus === 'REPAIRED'
          ? 'DONE'
          : 'FAILED';

    const primaryFailure = params.failureEvents[0];
    const severity =
      primaryFailure?.level ??
      params.validationResults.find((r) => !r.passed)?.severity ??
      'L2';

    const visibleState = this.buildOnFailureVisibleState(dso, params.failedPhase, params);

    const step: HarnessTraceStep = {
      step: params.failedPhase,
      startedAt: now,
      endedAt: now,
      durationMs: 0,
      runStatus: params.runStatus,
      visibleStateSnapshot: visibleState,
      decisionJustification: params.decisionJustification ?? {
        summary: `on-failure retrofit: ${String(params.failedPhase)}`,
        createdAt: now,
      },
      toolCalls: [],
      validationResults: params.validationResults,
      graderResults: params.graderResults,
      failureEvents: params.failureEvents.length ? params.failureEvents : undefined,
    };

    const trace: HarnessTrace = {
      traceId: params.traceId,
      requestId: params.requestId,
      startedAt: now,
      endedAt: now,
      finalStatus,
      steps: [step],
      ...((): { meta?: HarnessTraceCorrelationMeta } => {
        const meta = harnessTraceCorrelationMetaFromRuntime(
          (params.dsoSnapshot as DecisionState)?.harnessRuntime,
        );
        return meta ? { meta } : {};
      })(),
      retrofit: {
        triggeredBy: 'ON_FAILURE_TRIGGER',
        failedPhase: params.failedPhase,
        severity: String(severity),
      },
    };

    this.traces.set(params.traceId, trace);
    this.logger.log(
      `[HarnessTraceRecorder] on-failure retrofit traceId=${params.traceId} phase=${String(params.failedPhase)} status=${params.runStatus}`,
    );
    return trace;
  }

  private buildOnFailureVisibleState(
    dso: DecisionState,
    step: HarnessStepName,
    params: HarnessOnFailureRetrofitParams,
  ): Record<string, unknown> {
    const contract = this.contracts?.getContract(step);
    const projectionParams: HarnessProjectParams = {
      traceId: params.traceId,
      requestId: params.requestId,
    };
    if (contract && this.projection) {
      const ctx = this.projection.project(step, dso, contract, projectionParams);
      return {
        ...(ctx.visibleState as Record<string, unknown>),
        diagnosticContext: this.buildDiagnosticContext(dso, params),
      };
    }
    return {
      diagnosticContext: this.buildDiagnosticContext(dso, params),
      readableFallback: this.readablePathsFallback(dso),
    };
  }

  private buildDiagnosticContext(
    dso: DecisionState,
    params: HarnessOnFailureRetrofitParams,
  ): Record<string, unknown> {
    const hr = dso.harnessRuntime;
    const constraints = dso.constraints as { gateOutcome?: string } | undefined;
    return {
      researchEvidenceSnapshotId: hr?.researchEvidenceSnapshotId ?? null,
      gateOutcome: constraints?.gateOutcome ?? null,
      currentPhase: dso.systemState?.currentPhase ?? null,
      historicalFailuresInRun: params.priorFailuresSummary.map((f) => ({
        phase: f.step,
        level: f.severity,
        code: f.code,
        message: f.message,
        suggestedAction: f.suggestedAction,
      })),
    };
  }

  private readablePathsFallback(dso: DecisionState): Record<string, unknown> {
    const paths = [
      'userIntent',
      'tripState.planDraft',
      'harnessRuntime',
      'constraints',
      'systemState.requestId',
    ];
    const out: Record<string, unknown> = {};
    for (const p of paths) {
      const key = p.replace(/\./g, '_');
      out[key] = getAtPath(dso, p);
    }
    return out;
  }
}
