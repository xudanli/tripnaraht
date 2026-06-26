import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { FeasibilityReportAdapter } from '../adapters/feasibility-report.adapter';
import { buildTripLoopUiView } from '../adapters/trip-loop-ui.adapter';
import { getLoopDefinition } from '../registry/loop-definition.registry';
import { LoopBudgetService } from '../services/loop-budget.service';
import { LoopRunRepository } from '../services/loop-run.repository';
import { LoopStopPolicyService } from '../services/loop-stop-policy.service';
import { HumanApprovalService } from '../services/human-approval.service';
import { LoopEventEmitterService } from '../services/loop-event-emitter.service';
import { LoopLearningBridgeService } from '../services/loop-learning-bridge.service';
import type {
  ReadinessRepairIterationView,
  ReadinessRepairLoopResult,
} from '../types/loop-run.types';
import type { LoopIterationDecision } from '../types/loop-definition.types';

export interface RunReadinessRepairInput {
  tripId: string;
  triggerEventId?: string;
  triggerType?: string;
  forceRefreshEvidence?: boolean;
  runMonteCarlo?: boolean;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ReadinessRepairLoop {
  private readonly logger = new Logger(ReadinessRepairLoop.name);

  constructor(
    @Inject(forwardRef(() => FeasibilityReportAdapter))
    private readonly adapter: FeasibilityReportAdapter,
    private readonly repository: LoopRunRepository,
    private readonly budget: LoopBudgetService,
    private readonly stopPolicy: LoopStopPolicyService,
    private readonly humanApproval: HumanApprovalService,
    @Optional() private readonly loopEvents?: LoopEventEmitterService,
    @Optional() private readonly loopLearningBridge?: LoopLearningBridgeService,
  ) {}

  async run(input: RunReadinessRepairInput): Promise<ReadinessRepairLoopResult> {
    const def = getLoopDefinition('READINESS_REPAIR');
    const startedAtMs = Date.now();
    const run = await this.repository.createRun({
      tripId: input.tripId,
      loopType: 'READINESS_REPAIR',
      triggerEventId: input.triggerEventId,
      metadata: {
        requestId: input.requestId,
        userId: input.userId,
        triggerType: input.triggerType,
        ...input.metadata,
      },
    });

    const eventCtx = this.loopEvents?.createContext({
      loopRunId: run.id,
      loopType: 'READINESS_REPAIR',
      causationId: input.triggerEventId,
    });

    if (eventCtx && this.loopEvents) {
      await this.loopEvents.emitLoopStarted(
        input.tripId,
        eventCtx,
        {
          loopType: 'READINESS_REPAIR',
          triggerEventId: input.triggerEventId,
          triggerType: input.triggerType,
          runtimeState: 'OBSERVING',
        },
        { userId: input.userId, triggerEventId: input.triggerEventId },
      );
    }

    const { snapshot: before } = await this.adapter.validateAndSnapshot(input.tripId, {
      forceRefreshEvidence: input.forceRefreshEvidence ?? true,
      runMonteCarlo: input.runMonteCarlo,
    });

    const successStop = this.stopPolicy.evaluateReadinessRepairSuccess(def, before);
    if (successStop.stop) {
      await this.repository.updateRunStatus(run.id, successStop.status, {
        before,
        after: before,
        stopReason: successStop.reason,
      });
      return this.finalize(
        run.id,
        successStop.status,
        before,
        before,
        [],
        false,
        successStop.reason,
        input,
        eventCtx,
      );
    }

    const mustHandleIssues = (
      await this.adapter.validateAndSnapshot(input.tripId)
    ).report;
    const issues = this.adapter.listMustHandleIssues(mustHandleIssues);

    const iterations: ReadinessRepairIterationView[] = [];
    const recommendedPatches: ReadinessRepairLoopResult['recommendedPatches'] = [];
    const recentProposalKeys: string[] = [];
    let previousHardBlockers = before.hardBlockers;
    let previousReadiness = before.readinessScore;
    let stopReason: string | undefined;
    let finalStatus: ReadinessRepairLoopResult['status'] = 'RUNNING';
    let lastEventId: string | undefined = input.triggerEventId;

    for (let i = 0; i < issues.length; i++) {
      const sequence = i + 1;
      if (!this.budget.isWithinIterationBudget(sequence - 1, def.budgetPolicy)) {
        stopReason = 'max_iterations_reached';
        finalStatus = 'WAITING_FOR_HUMAN';
        break;
      }
      if (!this.budget.isWithinTimeBudget(startedAtMs, def.budgetPolicy)) {
        const timeStop = this.stopPolicy.evaluateTimeBudgetExceeded();
        if (timeStop.stop) {
          stopReason = timeStop.reason;
          finalStatus = timeStop.status;
        }
        break;
      }

      const issue = issues[i];
      const iterationId = this.loopEvents?.newIterationId();

      if (eventCtx && this.loopEvents) {
        const iterCtx = {
          ...eventCtx,
          iterationId,
          iterationSequence: sequence,
          causationId: lastEventId,
        };
        lastEventId = await this.loopEvents.emitBlockerDetected(input.tripId, iterCtx, {
          issueId: issue.id,
          blockerId: issue.id,
          issueTitle: issue.title,
          sequence,
        });
      }

      const repairOptions = await this.adapter.getRepairOptions(input.tripId, issue.id);
      const option = repairOptions.options[0];
      if (!option) {
        this.logger.warn(`No repair options for issue ${issue.id}`);
        continue;
      }

      const proposalKey = `${issue.id}:${option.id}`;

      if (eventCtx && this.loopEvents) {
        const iterCtx = {
          ...eventCtx,
          iterationId,
          iterationSequence: sequence,
          causationId: lastEventId,
        };
        lastEventId = await this.loopEvents.emitRepairProposed(input.tripId, iterCtx, {
          issueId: issue.id,
          optionId: option.id,
          title: option.title,
          actionType: option.actionType ?? 'unknown',
          sequence,
        });
      }

      const preview = await this.adapter.previewRepair(input.tripId, issue.id, {
        optionId: option.id,
        runGuardianNegotiation: true,
      });

      let scopedValidationPassed = preview.status === 'preview' && !preview.wouldDefer;
      let completionRateP10: number | undefined;
      if (scopedValidationPassed) {
        try {
          const scoped = await this.adapter.validateScopeForIssue(input.tripId, issue.id);
          scopedValidationPassed = scoped.canStartExecute || scoped.overallScore >= before.readinessScore;
          completionRateP10 = scoped.probabilisticAssessment?.feasibilityProbability;
        } catch {
          scopedValidationPassed = preview.status === 'preview';
        }
      }

      if (eventCtx && this.loopEvents) {
        const iterCtx = {
          ...eventCtx,
          iterationId,
          iterationSequence: sequence,
          causationId: lastEventId,
        };
        lastEventId = await this.loopEvents.emitValidation(
          input.tripId,
          iterCtx,
          {
            issueId: issue.id,
            passed: scopedValidationPassed,
            previewStatus: preview.status,
            wouldDefer: preview.wouldDefer,
            completionRateP10,
            sequence,
          },
          scopedValidationPassed,
        );
      }

      const decision: LoopIterationDecision = preview.wouldDefer
        ? 'WAIT_FOR_HUMAN'
        : scopedValidationPassed
          ? 'CONTINUE'
          : 'WAIT_FOR_HUMAN';

      const iterationView: ReadinessRepairIterationView = {
        sequence,
        issueId: issue.id,
        blockerId: repairOptions.blockerId,
        issueTitle: issue.title,
        proposal: {
          optionId: option.id,
          title: option.title,
          actionType: option.actionType ?? 'unknown',
        },
        validation: {
          passed: scopedValidationPassed,
          previewStatus: preview.status,
          wouldDefer: preview.wouldDefer,
          feasibilityScoreBefore: preview.impact.feasibilityScoreBefore,
          feasibilityScoreAfter: preview.impact.feasibilityScoreAfter,
          completionRateP10,
        },
        decision,
        attemptedOptions: repairOptions.options.map((o) => o.id),
      };
      iterations.push(iterationView);

      await this.repository.appendIteration({
        loopRunId: run.id,
        sequence,
        observedState: { snapshot: before, issueId: issue.id },
        diagnosis: {
          issueTitle: issue.title,
          priority: issue.priority,
          issueKind: issue.issueKind,
        },
        proposedAction: {
          optionId: option.id,
          title: option.title,
          actionType: option.actionType,
        },
        validationResult: iterationView.validation,
        decision,
      });

      if (scopedValidationPassed && !preview.wouldDefer) {
        recommendedPatches.push({
          issueId: issue.id,
          blockerId: repairOptions.blockerId,
          optionId: option.id,
          title: option.title,
          actionType: option.actionType ?? 'unknown',
          previewStatus: preview.status,
        });
      }

      const afterPartial = await this.adapter.getSnapshot(input.tripId);
      const noProgress = this.stopPolicy.evaluateNoProgress({
        previousHardBlockers,
        currentHardBlockers: afterPartial.hardBlockers,
        previousReadiness,
        currentReadiness: afterPartial.readinessScore,
        recentProposalKeys,
        currentProposalKey: proposalKey,
      });
      recentProposalKeys.push(proposalKey);
      previousHardBlockers = afterPartial.hardBlockers;
      previousReadiness = afterPartial.readinessScore;

      if (decision === 'WAIT_FOR_HUMAN') {
        stopReason = preview.wouldDefer ? 'guardian_deferred' : 'validation_requires_human';
        finalStatus = 'WAITING_FOR_HUMAN';
        break;
      }
      if (noProgress.stop) {
        stopReason = noProgress.reason;
        finalStatus = noProgress.status;
        break;
      }

      const iterCap = this.stopPolicy.evaluateIterationCap(sequence, def.budgetPolicy.maxIterations);
      if (iterCap.stop) {
        stopReason = iterCap.reason;
        finalStatus = iterCap.status;
        break;
      }
    }

    const after = await this.adapter.getSnapshot(input.tripId);
    const finalSuccess = this.stopPolicy.evaluateReadinessRepairSuccess(def, after);
    if (finalSuccess.stop && !stopReason) {
      finalStatus = finalSuccess.status;
      stopReason = finalSuccess.reason;
    } else if (finalStatus === 'RUNNING') {
      finalStatus = recommendedPatches.length > 0 ? 'WAITING_FOR_HUMAN' : 'COMPLETED';
      stopReason = stopReason ?? (recommendedPatches.length > 0 ? 'patches_ready_for_approval' : 'no_actionable_blockers');
    }

    const requiresApproval =
      recommendedPatches.length > 0 &&
      recommendedPatches.some((p) => this.humanApproval.requiresApprovalForRepair(p.actionType));

    await this.repository.updateRunStatus(run.id, finalStatus, {
      before,
      after,
      iterations: iterations.length,
      recommendedPatches,
      stopReason,
      requiresApproval,
    });

    return this.finalize(
      run.id,
      finalStatus,
      before,
      after,
      iterations,
      requiresApproval,
      stopReason,
      input,
      eventCtx,
    );
  }

  private async finalize(
    loopRunId: string,
    status: ReadinessRepairLoopResult['status'],
    before: ReadinessRepairLoopResult['before'],
    after: ReadinessRepairLoopResult['after'],
    iterations: ReadinessRepairIterationView[],
    requiresApproval: boolean,
    stopReason: string | undefined,
    input: RunReadinessRepairInput,
    eventCtx?: ReturnType<LoopEventEmitterService['createContext']>,
  ): Promise<ReadinessRepairLoopResult> {
    const result = this.buildResult(
      loopRunId,
      status,
      before,
      after,
      iterations,
      requiresApproval,
      stopReason,
    );

    if (eventCtx && this.loopEvents) {
      await this.loopEvents.emitLoopCompleted(input.tripId, eventCtx, {
        status,
        stopReason,
        requiresApproval,
        iterationCount: iterations.length,
        before: before as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
      });
    }

    result.ui = buildTripLoopUiView(result);
    if (this.loopLearningBridge) {
      void this.loopLearningBridge.notifyLoopCompleted({
        tripId: input.tripId,
        loopRunId,
        loopType: 'READINESS_REPAIR',
        status,
        stopReason,
        userId: input.userId,
      });
    }
    return result;
  }

  private buildResult(
    loopRunId: string,
    status: ReadinessRepairLoopResult['status'],
    before: ReadinessRepairLoopResult['before'],
    after: ReadinessRepairLoopResult['after'],
    iterations: ReadinessRepairIterationView[],
    requiresApproval: boolean,
    stopReason?: string,
  ): ReadinessRepairLoopResult {
    return {
      loopRunId,
      status,
      runtimeState: this.humanApproval.mapStatusToRuntimeState(status),
      before,
      after,
      iterations,
      recommendedPatches: iterations
        .filter((it) => it.validation.passed && !it.validation.wouldDefer)
        .map((it) => ({
          issueId: it.issueId,
          blockerId: it.blockerId,
          optionId: it.proposal.optionId,
          title: it.proposal.title,
          actionType: it.proposal.actionType,
          previewStatus: it.validation.previewStatus,
        })),
      requiresApproval,
      stopReason,
    };
  }
}
