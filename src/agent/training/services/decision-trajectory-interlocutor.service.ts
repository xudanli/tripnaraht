import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { GateResult, DecisionLogEntry, Itinerary } from '../../interfaces/trip-plan.interface';
import {
  type DebateCompileInput,
  type DecisionTrajectoryFinalizeArtifacts,
  type DecisionTrajectoryInputContext,
  type DecisionTrajectoryV1,
  type DecisionTrajectoryAxiomGate,
  type DecisionTrajectoryOrchestrationStep,
  type RedactedDebateArtifact,
} from '../interfaces/decision-trajectory.types';
import { PIIAnonymizerService } from './pii-anonymizer.service';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { isDecisionTrajectoryCaptureEnabled } from '../utils/decision-trajectory-feature.util';
import { compileDebateArtifact } from '../utils/compile-debate-artifact.util';
import {
  alignOrchestrationStepsWithHarness,
  buildHarnessTraceRef,
} from '../utils/harness-orchestration-alignment.util';
import {
  buildInitialDecisionTrajectoryPayload,
  decisionLogDigest,
  decisionLogToOrchestrationSteps,
  mergeOrchestrationSteps,
} from '../utils/decision-trajectory-payload.util';
import { HarnessShadowGraderService } from './harness-shadow-grader.service';

@Injectable()
export class DecisionTrajectoryInterlocutorService {
  private readonly logger = new Logger(DecisionTrajectoryInterlocutorService.name);

  /** PR-B：跨服务（Guardians ↔ Orchestrator）暂存脱敏辩论产物，finalize 时消费 */
  private readonly debateBufferByRequestId = new Map<string, RedactedDebateArtifact>();

  /** PR-D：首次 PLAN_GEN 拓扑快照（VERIFY/REPAIR 前） */
  private readonly planGenDraftBufferByRequestId = new Map<string, Itinerary>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly piiAnonymizer?: PIIAnonymizerService,
    @Optional() private readonly rewardExtractor?: RewardSignalExtractorService,
    @Optional() private readonly shadowGrader?: HarnessShadowGraderService,
  ) {}

  isEnabled(): boolean {
    return isDecisionTrajectoryCaptureEnabled();
  }

  /**
   * PR-B：编译并写入请求级辩论缓冲（Guardians 辩论完成时调用）。
   */
  appendDebateBuffer(requestId: string, input: DebateCompileInput): void {
    if (!this.isEnabled()) return;
    const rid = requestId?.trim();
    if (!rid) return;
    const artifact = this.compileDebateArtifact(input);
    if (!artifact) return;
    this.debateBufferByRequestId.set(rid, artifact);
    this.logger.debug(`[DecisionTrajectory] debate buffer set requestId=${rid} source=${artifact.source}`);
  }

  /** 读取并清空辩论缓冲（finalize 单次消费）。 */
  takeDebateBuffer(requestId: string): RedactedDebateArtifact | undefined {
    const rid = requestId?.trim();
    if (!rid) return undefined;
    const artifact = this.debateBufferByRequestId.get(rid);
    this.debateBufferByRequestId.delete(rid);
    return artifact;
  }

  compileDebateArtifact(input: DebateCompileInput): RedactedDebateArtifact | undefined {
    return compileDebateArtifact(input, this.piiAnonymizer);
  }

  /**
   * PR-D：锁定首轮 PLAN_GEN 行程（每个 requestId 仅保留第一次有效拓扑）。
   */
  capturePlanGenDraft(requestId: string, itinerary: Itinerary): void {
    if (!this.isEnabled()) return;
    const rid = requestId?.trim();
    if (!rid || !itinerary?.days?.length) return;
    if (this.planGenDraftBufferByRequestId.has(rid)) return;

    const draft = this.redact(itinerary) as Itinerary;
    this.planGenDraftBufferByRequestId.set(rid, draft);
    this.logger.debug(`[DecisionTrajectory] plan_gen draft captured requestId=${rid} days=${draft.days?.length ?? 0}`);
  }

  takePlanGenDraft(requestId: string): Itinerary | undefined {
    const rid = requestId?.trim();
    if (!rid) return undefined;
    const draft = this.planGenDraftBufferByRequestId.get(rid);
    this.planGenDraftBufferByRequestId.delete(rid);
    return draft;
  }

  /**
   * 阶段一：GATE_EVAL 后占坑，记录冻结输入与门控快照。
   */
  async upsertDraft(
    requestId: string,
    inputContext: DecisionTrajectoryInputContext,
    axiomGate: DecisionTrajectoryAxiomGate,
  ): Promise<void> {
    if (!this.isEnabled()) return;

    const tripId = inputContext.trip_id?.trim() || null;
    const anonymizedContext = this.redact(inputContext) as DecisionTrajectoryInputContext;
    const payload = buildInitialDecisionTrajectoryPayload(
      requestId,
      anonymizedContext,
      axiomGate,
      tripId,
    );

    try {
      await this.prisma.decisionTrajectory.upsert({
        where: { requestId },
        create: {
          requestId,
          tripId,
          status: 'PENDING',
          payload: payload as object,
        },
        update: {
          tripId: tripId ?? undefined,
          payload: payload as object,
          status: 'PENDING',
        },
      });
      this.logger.debug(`[DecisionTrajectory] draft upserted requestId=${requestId}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[DecisionTrajectory] upsertDraft failed requestId=${requestId}: ${msg}`);
    }
  }

  /**
   * 执行中追加编排步（读-改-写；Prisma 无 jsonAppend）。
   */
  async appendOrchestrationSteps(
    requestId: string,
    steps: DecisionTrajectoryOrchestrationStep[],
  ): Promise<void> {
    if (!this.isEnabled() || !steps.length) return;

    try {
      const row = await this.prisma.decisionTrajectory.findUnique({ where: { requestId } });
      if (!row) return;
      const payload = row.payload as unknown as DecisionTrajectoryV1;
      const merged = mergeOrchestrationSteps(payload.orchestration_steps ?? [], steps);
      await this.prisma.decisionTrajectory.update({
        where: { requestId },
        data: {
          payload: {
            ...payload,
            orchestration_steps: merged,
          } as object,
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[DecisionTrajectory] appendSteps failed requestId=${requestId}: ${msg}`);
    }
  }

  /**
   * 阶段二：编排出口闭合；计算编排语义 Reward 并落盘。
   */
  async finalize(
    requestId: string,
    artifacts: DecisionTrajectoryFinalizeArtifacts,
  ): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const row = await this.prisma.decisionTrajectory.findUnique({ where: { requestId } });
      if (!row) {
        this.logger.warn(`[DecisionTrajectory] finalize: draft missing requestId=${requestId}`);
        return;
      }

      const existing = row.payload as unknown as DecisionTrajectoryV1;
      const logSteps = artifacts.decisionLog
        ? decisionLogToOrchestrationSteps(artifacts.decisionLog)
        : [];
      const extraSteps = artifacts.orchestrationSteps ?? [];
      const mergedSteps = mergeOrchestrationSteps(
        existing.orchestration_steps ?? [],
        mergeOrchestrationSteps(extraSteps, logSteps),
      );
      const alignedSteps = alignOrchestrationStepsWithHarness(mergedSteps, {
        decisionLog: artifacts.decisionLog,
        harnessTracePath: artifacts.harnessTracePath,
        decisionState: artifacts.decisionState,
      });
      const harnessTrace = buildHarnessTraceRef({
        exportPath: artifacts.harnessTracePath ?? null,
        traceId: artifacts.harnessTraceId,
        decisionState: artifacts.decisionState,
      });

      const bufferedDebate = this.takeDebateBuffer(requestId);
      let debateHistory =
        artifacts.debateHistory ?? bufferedDebate ?? existing.debate_history;
      if (!debateHistory && artifacts.finalOutput?.gate_result) {
        debateHistory = this.compileDebateArtifact({
          source:
            artifacts.finalOutput.gate_result.guardian_results?.source === 'llm_debate'
              ? 'llm_debate'
              : 'deterministic_projection',
          gate: artifacts.finalOutput.gate_result,
        });
      }

      const bufferedDraft = this.takePlanGenDraft(requestId);
      const planGenDraft =
        bufferedDraft ??
        (existing.plan_gen_draft_itinerary
          ? (this.redact(existing.plan_gen_draft_itinerary) as Itinerary)
          : undefined);

      const finalizedPayload: DecisionTrajectoryV1 = {
        ...existing,
        orchestration_steps: alignedSteps,
        debate_history: debateHistory,
        ...(planGenDraft
          ? {
              plan_gen_draft_itinerary: planGenDraft,
              plan_gen_draft_captured_at_ms:
                existing.plan_gen_draft_captured_at_ms ?? Date.now(),
            }
          : {}),
        final_output: artifacts.finalOutput
          ? (this.redact(artifacts.finalOutput) as DecisionTrajectoryV1['final_output'])
          : existing.final_output,
        harness_trace_export_path: artifacts.harnessTracePath ?? null,
        harness_trace: harnessTrace,
        decision_log_digest: artifacts.decisionLog
          ? decisionLogDigest(artifacts.decisionLog)
          : existing.decision_log_digest,
      };

      const rewardResult = this.rewardExtractor
        ? this.rewardExtractor.extractFromOrchestrationOutcome(
            finalizedPayload,
            artifacts.decisionLog ?? [],
          )
        : { totalReward: 0, outcome: 'INCONCLUSIVE' as const, trainable: false, signals: [] };

      await this.prisma.decisionTrajectory.update({
        where: { requestId },
        data: {
          status: 'FINALIZED',
          totalReward: rewardResult.totalReward,
          orchestrationOutcome: rewardResult.outcome,
          rewardSignals: rewardResult.signals as object[],
          payload: finalizedPayload as object,
        },
      });

      this.logger.log(
        `[DecisionTrajectory] finalized requestId=${requestId} outcome=${rewardResult.outcome} reward=${rewardResult.totalReward}`,
      );

      this.shadowGrader?.scheduleGradeFromTrajectory(requestId, finalizedPayload, {
        outcome: rewardResult.outcome,
        totalReward: rewardResult.totalReward,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[DecisionTrajectory] finalize failed requestId=${requestId}: ${msg}`, stack);
      await this.markFailed(requestId).catch(() => {});
    }
  }

  async markFailed(requestId: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.prisma.decisionTrajectory.update({
        where: { requestId },
        data: { status: 'FAILED' },
      });
    } catch {
      // draft may never have been created
    }
  }

  /** 编排出口统一组包（供 ClaudeOrchestrator 调用）。 */
  buildFinalizeArtifactsFromOrchestration(params: {
    state: {
      request_id: string;
      itinerary?: unknown;
      gate_result?: GateResult;
      decision_log?: DecisionLogEntry[];
      metadata?: Record<string, unknown>;
    };
    answerText?: string;
    harnessTracePath?: string | null;
    debateHistory?: RedactedDebateArtifact;
    harnessTraceId?: string | null;
  }): DecisionTrajectoryFinalizeArtifacts {
    return {
      orchestrationSteps: [],
      debateHistory: params.debateHistory,
      harnessTracePath: params.harnessTracePath ?? null,
      harnessTraceId: params.harnessTraceId ?? null,
      decisionLog: params.state.decision_log ?? [],
      finalOutput: {
        itinerary: params.state.itinerary as Itinerary | undefined,
        gate_result: params.state.gate_result,
        narrator_text: params.answerText,
      },
    };
  }

  private redact<T>(value: T): T {
    if (!this.piiAnonymizer) return value;
    return this.piiAnonymizer.anonymizeJsonValue(value);
  }
}
