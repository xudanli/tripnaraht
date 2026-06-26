import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ReadinessRepairLoop, type RunReadinessRepairInput } from '../loops/readiness-repair.loop';
import { InTripRecoveryLoop, type RunInTripRecoveryInput } from '../loops/in-trip-recovery.loop';
import { FeasibilityReportAdapter } from '../adapters/feasibility-report.adapter';
import { ExecutionAdvisoryAdapter } from '../adapters/execution-advisory.adapter';
import { buildTripLoopUiView } from '../adapters/trip-loop-ui.adapter';
import { buildInTripLoopUiView } from '../adapters/in-trip-loop-ui.adapter';
import { LoopRunRepository } from '../services/loop-run.repository';
import type { LoopRunDetail } from '../types/loop-run.types';
import type { ReadinessRepairLoopResult } from '../types/loop-run.types';
import type { InTripRecoveryLoopResult } from '../types/in-trip-recovery.types';
import type { FeasibilityApplyRepairBodyDto } from '../../trips/trip-constraint-solver/dto/feasibility-report.dto';
import type { TripLoopUiViewDto } from '../adapters/trip-loop-ui.adapter';
import type { InTripLoopUiViewDto } from '../adapters/in-trip-loop-ui.adapter';
import { DecisionLearningLoop, type RunDecisionLearningInput } from '../loops/decision-learning.loop';
import { LoopEvalCaseStorageService } from '../services/loop-eval-case.storage.service';
import { LoopEvalReplayService } from '../services/loop-eval-replay.service';
import { LoopEvalApprovalService } from '../services/loop-eval-approval.service';
import type { LoopEvalApprovalStatus } from '../types/loop-eval-case.types';

@Injectable()
export class LoopOrchestratorService {
  constructor(
    @Inject(forwardRef(() => ReadinessRepairLoop))
    private readonly readinessRepairLoop: ReadinessRepairLoop,
    private readonly inTripRecoveryLoop: InTripRecoveryLoop,
    @Inject(forwardRef(() => DecisionLearningLoop))
    private readonly decisionLearningLoop: DecisionLearningLoop,
    private readonly repository: LoopRunRepository,
    private readonly feasibilityAdapter: FeasibilityReportAdapter,
    private readonly executionAdapter: ExecutionAdvisoryAdapter,
    private readonly evalStorage: LoopEvalCaseStorageService,
    @Inject(forwardRef(() => LoopEvalReplayService))
    private readonly evalReplay: LoopEvalReplayService,
    private readonly evalApproval: LoopEvalApprovalService,
  ) {}

  runReadinessRepair(input: RunReadinessRepairInput): Promise<ReadinessRepairLoopResult> {
    return this.readinessRepairLoop.run(input);
  }

  runInTripRecovery(input: RunInTripRecoveryInput): Promise<InTripRecoveryLoopResult> {
    return this.inTripRecoveryLoop.run(input);
  }

  runDecisionLearning(input: RunDecisionLearningInput) {
    return this.decisionLearningLoop.run(input);
  }

  listEvalCases(tripId?: string, approvalStatus?: LoopEvalApprovalStatus) {
    return this.evalStorage.listCases(
      tripId || approvalStatus ? { tripId, approvalStatus } : undefined,
    );
  }

  approveEvalCase(tripId: string, caseId: string, userId: string, note?: string) {
    return this.evalApproval.approve({ tripId, caseId, userId, note });
  }

  rejectEvalCase(tripId: string, caseId: string, userId: string, note?: string) {
    return this.evalApproval.reject({ tripId, caseId, userId, note });
  }

  replayEvalCase(caseId: string, userId: string) {
    return this.evalReplay.replayCaseById(caseId, userId);
  }

  async getLatestReadinessRepairUi(tripId: string): Promise<{
    loopRun: LoopRunDetail | null;
    ui: TripLoopUiViewDto | null;
  }> {
    const run = await this.repository.findLatestRun(tripId, 'READINESS_REPAIR');
    if (!run) {
      return { loopRun: null, ui: null };
    }
    const detail = await this.repository.findRunWithIterations(run.id);
    if (!detail) {
      return { loopRun: null, ui: null };
    }

    const outcome = run.finalOutcome as Record<string, unknown> | undefined;
    const result: ReadinessRepairLoopResult = {
      loopRunId: run.id,
      status: run.status,
      runtimeState: run.status === 'WAITING_FOR_HUMAN' ? 'WAITING_FOR_HUMAN' : 'MONITORING',
      before: (outcome?.before as ReadinessRepairLoopResult['before']) ?? {
        readinessScore: 0,
        hardBlockers: 0,
        mustHandleCount: 0,
        suggestAdjustCount: 0,
        canStartExecute: false,
        verdictStatus: 'UNKNOWN',
      },
      after: (outcome?.after as ReadinessRepairLoopResult['after']) ?? {
        readinessScore: 0,
        hardBlockers: 0,
        mustHandleCount: 0,
        suggestAdjustCount: 0,
        canStartExecute: false,
        verdictStatus: 'UNKNOWN',
      },
      iterations: detail.iterations.map((it, idx) => ({
        sequence: it.sequence,
        issueId: String(it.diagnosis.issueId ?? it.observedState.issueId ?? idx),
        blockerId: String(it.proposedAction.blockerId ?? ''),
        issueTitle: String(it.diagnosis.issueTitle ?? ''),
        proposal: {
          optionId: String(it.proposedAction.optionId ?? ''),
          title: String(it.proposedAction.title ?? ''),
          actionType: String(it.proposedAction.actionType ?? 'unknown'),
        },
        validation: it.validationResult as ReadinessRepairLoopResult['iterations'][0]['validation'],
        decision: it.decision,
        attemptedOptions: [],
      })),
      recommendedPatches: (outcome?.recommendedPatches as ReadinessRepairLoopResult['recommendedPatches']) ?? [],
      requiresApproval: Boolean(outcome?.requiresApproval),
      stopReason: typeof outcome?.stopReason === 'string' ? outcome.stopReason : undefined,
    };

    return {
      loopRun: detail,
      ui: buildTripLoopUiView(result),
    };
  }

  async getLatestInTripRecoveryUi(tripId: string, userId: string): Promise<{
    loopRun: LoopRunDetail | null;
    ui: InTripLoopUiViewDto | null;
  }> {
    const run = await this.repository.findLatestRun(tripId, 'IN_TRIP_RECOVERY');
    if (!run) {
      return { loopRun: null, ui: null };
    }
    const detail = await this.repository.findRunWithIterations(run.id);
    if (!detail) {
      return { loopRun: null, ui: null };
    }

    const outcome = run.finalOutcome as Record<string, unknown> | undefined;
    const result: InTripRecoveryLoopResult = {
      loopRunId: run.id,
      status: run.status,
      runtimeState: run.status === 'WAITING_FOR_HUMAN' ? 'WAITING_FOR_HUMAN' : 'MONITORING',
      before: (outcome?.before as InTripRecoveryLoopResult['before']) ?? {
        verdictStatus: 'UNKNOWN',
        openEnvironmentEvents: 0,
        redEvents: 0,
        delayMinutes: 0,
        atRiskItems: 0,
        onTrack: false,
      },
      after: (outcome?.after as InTripRecoveryLoopResult['after']) ?? {
        verdictStatus: 'UNKNOWN',
        openEnvironmentEvents: 0,
        redEvents: 0,
        delayMinutes: 0,
        atRiskItems: 0,
        onTrack: false,
      },
      iterations: detail.iterations.map((it) => ({
        sequence: it.sequence,
        triggerKind: (it.diagnosis.triggerKind as InTripRecoveryLoopResult['iterations'][0]['triggerKind']) ?? 'ENVIRONMENT_EVENT',
        environmentEventId: it.proposedAction.environmentEventId as string | undefined,
        triggerTitle: String(it.diagnosis.triggerTitle ?? ''),
        proposal: {
          planId: String(it.proposedAction.planId ?? ''),
          title: String(it.proposedAction.title ?? ''),
          actionType: 'in_trip_plan',
        },
        validation: it.validationResult as InTripRecoveryLoopResult['iterations'][0]['validation'],
        decision: it.decision,
        attemptedPlans: [],
      })),
      recommendedPlans: (outcome?.recommendedPlans as InTripRecoveryLoopResult['recommendedPlans']) ?? [],
      requiresApproval: Boolean(outcome?.requiresApproval),
      stopReason: typeof outcome?.stopReason === 'string' ? outcome.stopReason : undefined,
    };

    void userId;
    return {
      loopRun: detail,
      ui: buildInTripLoopUiView(result),
    };
  }

  async getLoopRun(loopRunId: string): Promise<LoopRunDetail> {
    const run = await this.repository.findRunWithIterations(loopRunId);
    if (!run) {
      throw new NotFoundException(`Loop run ${loopRunId} 不存在`);
    }
    return run;
  }

  async applyRecommendedPatches(
    tripId: string,
    loopRunId: string,
    patches: Array<{ issueId: string; optionId: string } & Partial<FeasibilityApplyRepairBodyDto>>,
  ) {
    const run = await this.getLoopRun(loopRunId);
    if (run.tripId !== tripId) {
      throw new NotFoundException(`Loop run ${loopRunId} 不属于行程 ${tripId}`);
    }

    const results = [];
    for (const patch of patches) {
      const applied = await this.feasibilityAdapter.applyRepair(tripId, patch.issueId, {
        optionId: patch.optionId,
        executeDecision: patch.executeDecision ?? true,
        persistDecision: patch.persistDecision ?? true,
        runGuardianNegotiation: patch.runGuardianNegotiation ?? true,
        forceDecisionRepair: patch.forceDecisionRepair,
        reason: patch.reason,
      });
      results.push({ issueId: patch.issueId, ...applied });
    }

    const after = await this.feasibilityAdapter.getSnapshot(tripId);
    await this.repository.updateRunStatus(loopRunId, 'COMPLETED', {
      appliedPatches: patches,
      after,
    });

    return { loopRunId, applied: results, after };
  }

  async applyInTripPlans(
    tripId: string,
    loopRunId: string,
    userId: string,
    plans: Array<{ environmentEventId: string; planId: string }>,
  ) {
    const run = await this.getLoopRun(loopRunId);
    if (run.tripId !== tripId) {
      throw new NotFoundException(`Loop run ${loopRunId} 不属于行程 ${tripId}`);
    }
    if (run.loopType !== 'IN_TRIP_RECOVERY') {
      throw new NotFoundException(`Loop run ${loopRunId} 不是行中恢复循环`);
    }

    const results = [];
    for (const plan of plans) {
      const resolved = await this.executionAdapter.resolveEnvironmentPlan(
        tripId,
        plan.environmentEventId,
        userId,
        plan.planId,
      );
      results.push(resolved);
    }

    const advisory = await this.executionAdapter.getAdvisory(tripId, userId);
    const envCount = advisory.deviations.filter((d) => d.id.startsWith('dev-env-')).length;
    const after = this.executionAdapter.toSnapshot(advisory, envCount, 0);

    await this.repository.updateRunStatus(loopRunId, 'COMPLETED', {
      appliedPlans: plans,
      after,
    });

    return { loopRunId, applied: results, after };
  }
}
