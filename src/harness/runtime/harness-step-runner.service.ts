import { Injectable, Logger } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { HarnessStepName, type HarnessStepContract } from '../contracts/harness-step.types';
import { HarnessStepContractRegistryService } from './harness-step-contract.registry';
import {
  HarnessStateProjectionService,
  type HarnessProjectParams,
} from './state-projection.service';
import { HarnessDeterministicValidatorsFacade } from './harness-deterministic-validators.facade';
import { HarnessInferentialGradersFacade } from '../inferential/harness-inferential-graders.facade';
import { HarnessFailureRouterService } from './harness-failure-router.service';
import { HarnessTraceRecorderService } from '../tracing/harness-trace-recorder.service';
import type { HarnessValidationResult } from '../contracts/validation.types';
import type {
  HarnessDecisionJustification,
  HarnessStepRunStatus,
  HarnessTraceCorrelationMeta,
  HarnessTraceFinalStatus,
} from '../tracing/harness-trace.types';
import type { HarnessFailureEvent } from '../failures/failure-event.types';
import type { HarnessGraderResult } from '../inferential/harness-inferential-grader.interface';
import { getAtPath } from '../lib/dso-path.util';
import type { HarnessStepAdmissionResult } from './harness-step-admission.types';
import { suggestPreviousHarnessStep } from '../lib/harness-step-order';

export type { HarnessStepRunStatus };
export type { HarnessStepAdmissionResult } from './harness-step-admission.types';

export interface HarnessStepExecutionResult {
  step: HarnessStepName;
  status: HarnessStepRunStatus;
  outputPatch?: Partial<DecisionState>;
  validationResults: HarnessValidationResult[];
  graderResults?: HarnessGraderResult[];
  failureEvents?: HarnessFailureEvent[];
  durationMs: number;
  decisionJustification?: HarnessDecisionJustification;
}

@Injectable()
export class HarnessStepRunnerService {
  private readonly logger = new Logger(HarnessStepRunnerService.name);

  /** 为压测 / 快速路径跳过推理型 grader（确定性校验仍执行） */
  private shouldSkipInferential(): boolean {
    return process.env.HARNESS_SKIP_INFERENTIAL === '1';
  }

  private maybeFinalizeTrace(traceId: string, finalize?: HarnessTraceFinalStatus): void {
    if (finalize) {
      this.trace.finalize(traceId, finalize);
    }
  }

  /**
   * 将内存中的整条 trace 标为终态（Kernel 在 `HARNESS_RECORD_TRACE=1` 且 harness 失败时收口；亦可由编排显式调用）。
   */
  finalizeRecordedTrace(traceId: string, status: HarnessTraceFinalStatus): void {
    this.trace.finalize(traceId, status);
  }

  /** 同 `finalizeRecordedTrace`，但若 trace 已闭合（`endedAt` 已有）则不变更。 */
  finalizeRecordedTraceIfStillOpen(traceId: string, status: HarnessTraceFinalStatus): void {
    this.trace.finalizeIfStillOpen(traceId, status);
  }

  constructor(
    private readonly contracts: HarnessStepContractRegistryService,
    private readonly projection: HarnessStateProjectionService,
    private readonly validators: HarnessDeterministicValidatorsFacade,
    private readonly inferentialGraders: HarnessInferentialGradersFacade,
    private readonly failureRouter: HarnessFailureRouterService,
    private readonly trace: HarnessTraceRecorderService,
  ) {}

  private suggestHarnessFallback(step: HarnessStepName): HarnessStepName {
    return suggestPreviousHarnessStep(step);
  }

  /**
   * 断点续跑 / API 准入：对当前完整 DSO 校验「能否进入该 Harness 步骤」（与 `runStep` 同套校验，不写 trace）。
   */
  async validateStepAdmission(
    fullState: DecisionState,
    step: HarnessStepName,
    params: HarnessProjectParams,
  ): Promise<HarnessStepAdmissionResult> {
    const exec = await this.runStep(step, fullState, params, {
      skipTrace: true,
      decisionJustification: {
        summary: `validateStepAdmission: ${String(step)}`,
        createdAt: new Date().toISOString(),
      },
    });
    const passed = exec.status === 'PASSED' || exec.status === 'REPAIRED';
    return {
      passed,
      harness_step: step,
      run_status: exec.status,
      validation_results: exec.validationResults,
      grader_results: exec.graderResults,
      suggested_fallback_step: passed ? undefined : this.suggestHarnessFallback(step),
    };
  }

  private traceCorrelationFromState(fullState: DecisionState): HarnessTraceCorrelationMeta | undefined {
    const id = fullState.harnessRuntime?.evaluationRunId;
    return typeof id === 'string' && id.trim() ? { evaluationRunId: id.trim() } : undefined;
  }

  /** 契约 `requiredInputPaths`：在完整 DSO 上检查路径存在（非 null/undefined）。 */
  private collectRequiredInputFailures(
    fullState: DecisionState,
    contract: HarnessStepContract,
  ): HarnessValidationResult[] {
    const failures: HarnessValidationResult[] = [];
    for (const p of contract.requiredInputPaths) {
      const v = getAtPath(fullState, p);
      if (v === undefined || v === null) {
        failures.push({
          passed: false,
          severity: 'L2',
          code: 'REQUIRED_INPUT_MISSING',
          message: `Required DecisionState path missing or null: ${p}`,
          details: { path: p, step: contract.name },
        });
      }
    }
    return failures;
  }

  /**
   * Phase 1：requiredInputPaths → 确定性校验 →（全通过时）推理型 grader → trace（不含 LLM / tool 执行体）。
   */
  async runStep(
    step: HarnessStepName,
    fullState: DecisionState,
    params: HarnessProjectParams,
    options?: {
      decisionJustification?: HarnessDecisionJustification;
      skipTrace?: boolean;
      /** 在已写入本步 trace 后闭合整条 trace（用于单步即结束或回放落盘前的显式收尾） */
      finalizeTrace?: HarnessTraceFinalStatus;
    },
  ): Promise<HarnessStepExecutionResult> {
    const started = Date.now();
    const contract = this.contracts.getContract(step);
    if (!contract) {
      return {
        step,
        status: 'FAILED',
        validationResults: [
          {
            passed: false,
            severity: 'L2',
            code: 'CONTRACT_MISSING',
            message: `No harness contract registered for step ${step}`,
          },
        ],
        durationMs: Date.now() - started,
      };
    }

    const requestId =
      params.requestId ||
      fullState.systemState?.requestId ||
      fullState.requestId ||
      'unknown';

    const projectionParams: HarnessProjectParams = {
      ...params,
      requestId,
    };

    const requiredFailures = this.collectRequiredInputFailures(fullState, contract);

    if (contract.deterministicValidators.length === 0) {
      if (requiredFailures.length > 0) {
        const context = this.projection.project(
          step,
          fullState,
          contract,
          projectionParams,
        );
        const validationResults = requiredFailures;
        const validationFailureEvents = this.failureRouter.eventsFromValidation(
          contract,
          params.traceId,
          requestId,
          step,
          validationResults,
        );
        const hasL3 = validationResults.some((r) => !r.passed && r.severity === 'L3');
        const hasFail = validationResults.some((r) => !r.passed);
        const status: HarnessStepRunStatus = hasL3
          ? 'BLOCKED'
          : hasFail
            ? 'FAILED'
            : 'PASSED';
        if (!options?.skipTrace) {
          const stepDurationMs = Date.now() - started;
          this.trace.ensureTrace(params.traceId, requestId, this.traceCorrelationFromState(fullState));
          this.trace.appendStep(params.traceId, {
            step,
            startedAt: context.metadata.startedAt,
            endedAt: new Date().toISOString(),
            durationMs: stepDurationMs,
            runStatus: status,
            visibleStateSnapshot: context.visibleState,
            decisionJustification: options?.decisionJustification,
            toolCalls: [],
            validationResults,
            failureEvents: validationFailureEvents.length
              ? validationFailureEvents
              : undefined,
          });
          this.maybeFinalizeTrace(params.traceId, options?.finalizeTrace);
        }
        if (hasFail) {
          this.logger.warn(
            `Harness step ${step} ${status}: ${validationFailureEvents.map((e) => e.code).join(', ')}`,
          );
        }
        return {
          step,
          status,
          validationResults,
          failureEvents: validationFailureEvents.length ? validationFailureEvents : undefined,
          durationMs: Date.now() - started,
          decisionJustification: options?.decisionJustification,
        };
      }
      if (!options?.skipTrace) {
        const now = new Date().toISOString();
        const stepDurationMs = Date.now() - started;
        this.trace.ensureTrace(params.traceId, requestId, this.traceCorrelationFromState(fullState));
        this.trace.appendStep(params.traceId, {
          step,
          startedAt: now,
          endedAt: now,
          durationMs: stepDurationMs,
          runStatus: 'PASSED',
          visibleStateSnapshot: { _harness: 'no-deterministic-validators' },
          decisionJustification: options?.decisionJustification,
          toolCalls: [],
          validationResults: [],
        });
        this.maybeFinalizeTrace(params.traceId, options?.finalizeTrace);
      }
      return {
        step,
        status: 'PASSED',
        validationResults: [],
        durationMs: Date.now() - started,
        decisionJustification: options?.decisionJustification,
      };
    }

    const context = this.projection.project(
      step,
      fullState,
      contract,
      projectionParams,
    );

    const deterministicResults = await this.validators.runAll(
      contract.deterministicValidators,
      { step },
      context,
    );

    const validationResults = [...requiredFailures, ...deterministicResults];

    const deterministicOk = validationResults.every((r) => r.passed);
    let graderResults: HarnessGraderResult[] | undefined;
    let graderFailureEvents: HarnessFailureEvent[] = [];

    if (
      deterministicOk &&
      contract.inferentialGraders?.length &&
      !this.shouldSkipInferential()
    ) {
      graderResults = await this.inferentialGraders.runAll(
        contract.inferentialGraders,
        { step },
        context,
      );
      graderFailureEvents = this.failureRouter.eventsFromGraderResults(
        contract,
        params.traceId,
        requestId,
        step,
        graderResults,
      );
    }

    const validationFailureEvents = this.failureRouter.eventsFromValidation(
      contract,
      params.traceId,
      requestId,
      step,
      validationResults,
    );
    const failureEvents = [...validationFailureEvents, ...graderFailureEvents];

    const hasL3 =
      validationResults.some((r) => !r.passed && r.severity === 'L3') ||
      (graderResults?.some((g) => !g.passed && g.severity === 'L3') ?? false);
    const hasFail =
      validationResults.some((r) => !r.passed) ||
      (graderResults?.some((g) => !g.passed) ?? false);
    const status: HarnessStepRunStatus = hasL3
      ? 'BLOCKED'
      : hasFail
        ? 'FAILED'
        : 'PASSED';

    if (!options?.skipTrace) {
      const stepDurationMs = Date.now() - started;
      this.trace.ensureTrace(params.traceId, requestId, this.traceCorrelationFromState(fullState));
      this.trace.appendStep(params.traceId, {
        step,
        startedAt: context.metadata.startedAt,
        endedAt: new Date().toISOString(),
        durationMs: stepDurationMs,
        runStatus: status,
        visibleStateSnapshot: context.visibleState,
        decisionJustification: options?.decisionJustification,
        toolCalls: [],
        validationResults,
        graderResults,
        failureEvents: failureEvents.length ? failureEvents : undefined,
      });
      this.maybeFinalizeTrace(params.traceId, options?.finalizeTrace);
    }

    if (hasFail) {
      this.logger.warn(
        `Harness step ${step} ${status}: ${failureEvents.map((e) => e.code).join(', ')}`,
      );
    }

    return {
      step,
      status,
      validationResults,
      graderResults,
      failureEvents: failureEvents.length ? failureEvents : undefined,
      durationMs: Date.now() - started,
      decisionJustification: options?.decisionJustification,
    };
  }
}
