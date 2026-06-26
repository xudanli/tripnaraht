import { Injectable, Logger, Optional } from '@nestjs/common';
import { ExecutionAdvisoryAdapter } from '../adapters/execution-advisory.adapter';
import { buildInTripLoopUiView } from '../adapters/in-trip-loop-ui.adapter';
import { getLoopDefinition } from '../registry/loop-definition.registry';
import { LoopBudgetService } from '../services/loop-budget.service';
import { LoopRunRepository } from '../services/loop-run.repository';
import { LoopStopPolicyService } from '../services/loop-stop-policy.service';
import { HumanApprovalService } from '../services/human-approval.service';
import { LoopEventEmitterService } from '../services/loop-event-emitter.service';
import { LoopLearningBridgeService } from '../services/loop-learning-bridge.service';
import { InTripRecoveryValidatorService } from '../services/in-trip-recovery-validator.service';
import type {
  InTripRecoveryIterationView,
  InTripRecoveryLoopResult,
  InTripRecoverySnapshot,
  InTripTriggerKind,
} from '../types/in-trip-recovery.types';
import type { LoopIterationDecision } from '../types/loop-definition.types';

export interface RunInTripRecoveryInput {
  tripId: string;
  userId: string;
  triggerEventId?: string;
  triggerType?: string;
  environmentEventId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class InTripRecoveryLoop {
  private readonly logger = new Logger(InTripRecoveryLoop.name);

  constructor(
    private readonly adapter: ExecutionAdvisoryAdapter,
    private readonly repository: LoopRunRepository,
    private readonly budget: LoopBudgetService,
    private readonly stopPolicy: LoopStopPolicyService,
    private readonly humanApproval: HumanApprovalService,
    private readonly validator: InTripRecoveryValidatorService,
    @Optional() private readonly loopEvents?: LoopEventEmitterService,
    @Optional() private readonly loopLearningBridge?: LoopLearningBridgeService,
  ) {}

  async run(input: RunInTripRecoveryInput): Promise<InTripRecoveryLoopResult> {
    const def = getLoopDefinition('IN_TRIP_RECOVERY');
    const startedAtMs = Date.now();

    const advisory = await this.adapter.getAdvisory(input.tripId, input.userId);
    const envDeviations = advisory.deviations.filter((d) => d.id.startsWith('dev-env-'));
    const redCount = envDeviations.filter((d) => d.minutesImpact >= 20).length;

    const before = this.adapter.toSnapshot(advisory, envDeviations.length, redCount);

    const run = await this.repository.createRun({
      tripId: input.tripId,
      loopType: 'IN_TRIP_RECOVERY',
      triggerEventId: input.triggerEventId ?? input.environmentEventId,
      metadata: {
        userId: input.userId,
        triggerType: input.triggerType,
        ...input.metadata,
      },
    });

    const eventCtx = this.loopEvents?.createContext({
      loopRunId: run.id,
      loopType: 'IN_TRIP_RECOVERY',
      causationId: input.triggerEventId ?? input.environmentEventId,
    });

    if (eventCtx && this.loopEvents) {
      await this.loopEvents.emitLoopStarted(input.tripId, eventCtx, {
        loopType: 'IN_TRIP_RECOVERY',
        triggerEventId: input.triggerEventId,
        triggerType: input.triggerType,
        runtimeState: 'OBSERVING',
      }, { userId: input.userId });
    }

    if (before.onTrack && before.openEnvironmentEvents === 0 && before.delayMinutes < 15) {
      await this.repository.updateRunStatus(run.id, 'COMPLETED', { before, after: before, stopReason: 'on_track' });
      return this.finalize(run.id, 'COMPLETED', before, before, [], [], false, 'on_track', eventCtx, input);
    }

    let triggers = this.adapter.listActionableTriggers(advisory);
    if (input.environmentEventId) {
      triggers = triggers.filter((t) => t.eventId === input.environmentEventId);
      if (triggers.length === 0) {
        triggers.push({
          kind: 'ENVIRONMENT_EVENT',
          eventId: input.environmentEventId,
          title: '环境变化事件',
        });
      }
    }

    const iterations: InTripRecoveryIterationView[] = [];
    const recommendedPlans: InTripRecoveryLoopResult['recommendedPlans'] = [];
    let finalStatus: InTripRecoveryLoopResult['status'] = 'RUNNING';
    let stopReason: string | undefined;

    for (let i = 0; i < Math.min(triggers.length, def.budgetPolicy.maxIterations); i++) {
      const sequence = i + 1;
      if (!this.budget.isWithinIterationBudget(sequence - 1, def.budgetPolicy)) break;
      if (!this.budget.isWithinTimeBudget(startedAtMs, def.budgetPolicy)) {
        stopReason = 'time_budget_exhausted';
        finalStatus = 'FAILED';
        break;
      }

      const trigger = triggers[i];
      const triggerKind = this.resolveTriggerKind(trigger);

      let eventDetail;
      let plans: import('../../trips/in-trip-execution/types/environment-event.types').EnvironmentAlternativePlan[] = [];

      if (trigger.eventId && trigger.kind === 'ENVIRONMENT_EVENT') {
        try {
          eventDetail = await this.adapter.getEnvironmentEvent(input.tripId, trigger.eventId, input.userId);
          plans = eventDetail.alternativePlans ?? [];
        } catch (error) {
          this.logger.warn(`Failed to load environment event ${trigger.eventId}`);
        }
      } else if (trigger.kind === 'LATE_DEPARTURE') {
        plans = this.buildLateDeparturePlans(advisory);
      }

      const plan = this.pickBestPlan(plans);
      if (!plan) continue;

      const severity = eventDetail?.severity ?? (triggerKind === 'LATE_DEPARTURE' ? 'yellow' : 'yellow');
      const validation = this.validator.validateAlternativePlan(plan, {
        severity: severity === 'green' ? 'yellow' : severity,
        delayMinutes: advisory.currentState.delayMinutes,
      });

      const decision: LoopIterationDecision =
        plan.bookingRequired || !validation.passed ? 'WAIT_FOR_HUMAN' : 'CONTINUE';

      if (eventCtx && this.loopEvents) {
        await this.loopEvents.emitBlockerDetected(input.tripId, {
          ...eventCtx,
          iterationSequence: sequence,
          causationId: input.triggerEventId,
        }, {
          issueId: trigger.eventId ?? `late-departure-${sequence}`,
          blockerId: triggerKind,
          issueTitle: trigger.title,
          sequence,
        });
        await this.loopEvents.emitRepairProposed(input.tripId, {
          ...eventCtx,
          iterationSequence: sequence,
        }, {
          issueId: trigger.eventId ?? triggerKind,
          optionId: plan.planId,
          title: plan.name,
          actionType: 'in_trip_plan',
          sequence,
        });
        await this.loopEvents.emitValidation(
          input.tripId,
          { ...eventCtx, iterationSequence: sequence },
          {
            issueId: trigger.eventId ?? triggerKind,
            passed: validation.passed,
            previewStatus: 'preview',
            wouldDefer: plan.bookingRequired,
            completionRateP10: 1 - validation.lateProbabilityAfter,
            sequence,
          },
          validation.passed,
        );
      }

      const iterationView: InTripRecoveryIterationView = {
        sequence,
        triggerKind,
        environmentEventId: trigger.eventId,
        triggerTitle: trigger.title,
        proposal: {
          planId: plan.planId,
          title: plan.name,
          actionType: 'in_trip_plan',
        },
        validation: {
          passed: validation.passed,
          experienceEquivalence: plan.experienceEquivalence,
          wouldDefer: plan.bookingRequired,
          lateProbabilityBefore: validation.lateProbabilityBefore,
          lateProbabilityAfter: validation.lateProbabilityAfter,
        },
        decision,
        attemptedPlans: plans.map((p) => p.planId),
        protectedItems: eventDetail?.affectedItems.filter((a) => !a.refundable).map((a) => a.itemId),
      };
      iterations.push(iterationView);

      await this.repository.appendIteration({
        loopRunId: run.id,
        sequence,
        observedState: { snapshot: before, triggerKind, eventId: trigger.eventId },
        diagnosis: { triggerTitle: trigger.title, triggerKind },
        proposedAction: { planId: plan.planId, title: plan.name, environmentEventId: trigger.eventId },
        validationResult: iterationView.validation,
        decision,
      });

      if (validation.passed && !plan.bookingRequired && trigger.eventId) {
        recommendedPlans.push({
          environmentEventId: trigger.eventId,
          planId: plan.planId,
          title: plan.name,
          actionType: 'in_trip_plan',
          triggerKind,
        });
      }

      if (decision === 'WAIT_FOR_HUMAN') {
        stopReason = plan.bookingRequired ? 'booking_requires_approval' : 'validation_requires_human';
        finalStatus = 'WAITING_FOR_HUMAN';
        break;
      }
    }

    const afterAdvisory = await this.adapter.getAdvisory(input.tripId, input.userId);
    const afterEnv = afterAdvisory.deviations.filter((d) => d.id.startsWith('dev-env-'));
    const after = this.adapter.toSnapshot(afterAdvisory, afterEnv.length, redCount);

    if (finalStatus === 'RUNNING') {
      finalStatus =
        recommendedPlans.length > 0
          ? 'WAITING_FOR_HUMAN'
          : after.onTrack
            ? 'COMPLETED'
            : 'WAITING_FOR_HUMAN';
      stopReason = stopReason ?? (recommendedPlans.length > 0 ? 'plans_ready_for_approval' : 'monitoring_continue');
    }

    const requiresApproval =
      recommendedPlans.length > 0 ||
      iterations.some((it) => it.validation.wouldDefer || it.decision === 'WAIT_FOR_HUMAN');

    await this.repository.updateRunStatus(run.id, finalStatus, {
      before,
      after,
      iterations: iterations.length,
      recommendedPlans,
      stopReason,
      requiresApproval,
    });

    return this.finalize(
      run.id,
      finalStatus,
      before,
      after,
      iterations,
      recommendedPlans,
      requiresApproval,
      stopReason,
      eventCtx,
      input,
    );
  }

  private pickBestPlan(
    plans: import('../../trips/in-trip-execution/types/environment-event.types').EnvironmentAlternativePlan[],
  ) {
    if (plans.length === 0) return undefined;
    return [...plans].sort((a, b) => {
      const scoreA = a.experienceEquivalence - (a.bookingRequired ? 0.2 : 0);
      const scoreB = b.experienceEquivalence - (b.bookingRequired ? 0.2 : 0);
      return scoreB - scoreA;
    })[0];
  }

  private buildLateDeparturePlans(
    advisory: Awaited<ReturnType<ExecutionAdvisoryAdapter['getAdvisory']>>,
  ) {
    const delay = advisory.currentState.delayMinutes ?? 0;
    return [
      {
        planId: `late-skip-lunch-${delay}`,
        name: '跳过午餐停留点，改为沿途简餐',
        description: '压缩非核心停留以追回时间',
        timeAdjustment: '跳过 45 分钟停留',
        costDifference: -20,
        experienceEquivalence: 0.75,
        bookingRequired: false,
      },
      {
        planId: `late-buffer-${delay}`,
        name: '保留核心活动并增加缓冲',
        description: '接受部分后续活动压缩',
        timeAdjustment: '后续各 +30 分钟缓冲',
        costDifference: 0,
        experienceEquivalence: 0.68,
        bookingRequired: false,
      },
    ];
  }

  private resolveTriggerKind(trigger: {
    kind: string;
    type?: string;
    title: string;
  }): InTripTriggerKind {
    if (trigger.kind === 'LATE_DEPARTURE') return 'LATE_DEPARTURE';
    return this.adapter.mapTriggerKind(trigger.type, trigger.title);
  }

  private async finalize(
    loopRunId: string,
    status: InTripRecoveryLoopResult['status'],
    before: InTripRecoverySnapshot,
    after: InTripRecoverySnapshot,
    iterations: InTripRecoveryIterationView[],
    recommendedPlans: InTripRecoveryLoopResult['recommendedPlans'],
    requiresApproval: boolean,
    stopReason: string | undefined,
    eventCtx: ReturnType<LoopEventEmitterService['createContext']> | undefined,
    input: RunInTripRecoveryInput,
  ): Promise<InTripRecoveryLoopResult> {
    const result: InTripRecoveryLoopResult = {
      loopRunId,
      status,
      runtimeState: this.humanApproval.mapStatusToRuntimeState(status),
      before,
      after,
      iterations,
      recommendedPlans,
      requiresApproval,
      stopReason,
    };

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

    result.ui = buildInTripLoopUiView(result);
    if (this.loopLearningBridge) {
      void this.loopLearningBridge.notifyLoopCompleted({
        tripId: input.tripId,
        loopRunId,
        loopType: 'IN_TRIP_RECOVERY',
        status,
        stopReason,
        userId: input.userId,
      });
    }
    return result;
  }
}
