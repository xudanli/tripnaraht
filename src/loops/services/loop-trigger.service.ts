import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { LoopOrchestratorService } from './loop-orchestrator.service';
import { LoopRunRepository } from './loop-run.repository';
import { LoopEventEmitterService } from './loop-event-emitter.service';
import { isLoopAutoTriggerEnabled, isInTripLoopAutoTriggerEnabled, loopTriggerCooldownMs } from '../loop-engineering.config';
import type { LoopTriggerType } from '../events/loop-travel-event.types';
import type { ReadinessRepairLoopResult } from '../types/loop-run.types';
import { TravelEventType } from '../../trips/event-store/types/travel-event.types';
import { buildLoopIdempotencyKey } from '../events/loop-event.builder';
import { ContingencyOrchestratorService } from '../../decision/contingency/contingency-orchestrator.service';
import type { InTripLoopTriggerInput, InTripLoopTriggerOutcome } from './loop-trigger.types';
import { DecisionTriggerGatewayService } from '../../decision-runtime/trigger/decision-trigger.gateway.service';
import {
  dispatchInTripDeviationIfEnabled,
  resolveDecisionRunId,
} from '../../decision-runtime/trigger/record-trigger-lineage.util';
import { evaluateReplanningTrigger } from '../../decision-runtime/trigger/replanning-trigger.policy';
import type { ReplanningTriggerResult } from '../../decision-runtime/trigger/replanning-trigger.policy';
import type { DecisionTriggerInput } from '../../decision-runtime/contracts/decision-run-request';
import { isReplanningTriggerPolicyEnabled } from '../../decision-runtime/trigger/replanning-trigger.config';
import {
  inferInTripEventSeverity,
  shouldDelegateFullReplan,
  shouldRunInTripRecovery,
} from '../../decision-runtime/trigger/in-trip-replanning.util';
import { toReplanningTriggerDecision } from '../../decision-runtime/trigger/replanning-trigger-decision.util';

export interface LoopTriggerInput {
  tripId: string;
  triggerType: LoopTriggerType;
  triggerEventId?: string;
  externalEventId?: string;
  userId?: string;
  forceRefreshEvidence?: boolean;
  force?: boolean;
  /** Internal pipeline (e.g. post apply-repair re-score) bypasses LOOP_AUTO_TRIGGER_ENABLED gate */
  allowInternal?: boolean;
}

export type LoopTriggerOutcome =
  | { action: 'started'; result: ReadinessRepairLoopResult }
  | { action: 'skipped'; reason: string };

export type { InTripLoopTriggerInput, InTripLoopTriggerOutcome } from './loop-trigger.types';

@Injectable()
export class LoopTriggerService {
  private readonly logger = new Logger(LoopTriggerService.name);

  constructor(
    @Inject(forwardRef(() => LoopOrchestratorService))
    private readonly orchestrator: LoopOrchestratorService,
    private readonly repository: LoopRunRepository,
    private readonly loopEvents: LoopEventEmitterService,
    @Optional() private readonly contingencyOrchestrator?: ContingencyOrchestratorService,
    @Optional() private readonly triggerGateway?: DecisionTriggerGatewayService,
  ) {}

  isAutoTriggerEnabled(): boolean {
    return isLoopAutoTriggerEnabled();
  }

  async triggerReadinessRepair(input: LoopTriggerInput): Promise<LoopTriggerOutcome> {
    if (
      !input.force &&
      !input.allowInternal &&
      !this.isAutoTriggerEnabled() &&
      input.triggerType !== 'MANUAL'
    ) {
      return { action: 'skipped', reason: 'auto_trigger_disabled' };
    }

    const dedupeKey = buildLoopIdempotencyKey([
      input.tripId,
      'READINESS_REPAIR',
      input.triggerType,
      input.externalEventId ?? input.triggerEventId ?? '',
    ]);

    if (!input.force) {
      const skip = await this.shouldSkipDuplicate(input.tripId, dedupeKey);
      if (skip) {
        return { action: 'skipped', reason: skip };
      }
    }

    await this.emitTripSignal(input);

    const result = await this.orchestrator.runReadinessRepair({
      tripId: input.tripId,
      triggerEventId: input.triggerEventId ?? input.externalEventId,
      triggerType: input.triggerType,
      forceRefreshEvidence: input.forceRefreshEvidence ?? true,
      userId: input.userId,
      metadata: { triggerDedupeKey: dedupeKey },
    });

    return { action: 'started', result };
  }

  async triggerInTripRecovery(input: InTripLoopTriggerInput): Promise<InTripLoopTriggerOutcome> {
    if (
      this.contingencyOrchestrator &&
      !input._viaContingencyOrchestrator
    ) {
      const routed = await this.contingencyOrchestrator.trigger({
        tripId: input.tripId,
        reason: `in_trip:${input.triggerType}`,
        pathId: 'IN_TRIP_RECOVERY',
        metadata: { ...input },
      });
      if (routed.payload) {
        return routed.payload as InTripLoopTriggerOutcome;
      }
    }
    return this.executeInTripRecovery(input);
  }

  /** ContingencyOrchestrator IN_TRIP_RECOVERY handler 调用（避免递归） */
  async executeInTripRecovery(input: InTripLoopTriggerInput): Promise<InTripLoopTriggerOutcome> {
    if (
      !input.force &&
      !input.allowInternal &&
      !isInTripLoopAutoTriggerEnabled() &&
      input.triggerType !== 'MANUAL'
    ) {
      return { action: 'skipped', reason: 'in_trip_auto_trigger_disabled' };
    }

    const dedupeKey = buildLoopIdempotencyKey([
      input.tripId,
      'IN_TRIP_RECOVERY',
      input.triggerType,
      input.externalEventId ?? input.environmentEventId ?? input.triggerEventId ?? '',
    ]);

    if (!input.force) {
      const skip = await this.shouldSkipDuplicate(input.tripId, dedupeKey, 'IN_TRIP_RECOVERY');
      if (skip) {
        return { action: 'skipped', reason: skip };
      }
    }

    const eventSeverity = inferInTripEventSeverity(input.triggerType);
    const replanning = evaluateReplanningTrigger({
      tripId: input.tripId,
      triggerKind: 'IN_TRIP_DEVIATION',
      eventSeverity,
      metadata: { triggerType: input.triggerType, loopType: 'IN_TRIP_RECOVERY' },
    });
    const replanningDecision = toReplanningTriggerDecision(replanning, { eventSeverity });
    const gatewayInput = this.buildInTripGatewayInput(
      input,
      replanning,
      replanningDecision,
      eventSeverity,
    );

    if (
      isReplanningTriggerPolicyEnabled() &&
      !shouldRunInTripRecovery(replanning.action, {
        force: input.force,
        manual: input.triggerType === 'MANUAL',
      })
    ) {
      const reason = shouldDelegateFullReplan(replanning.action)
        ? 'replanning_policy_full_replan'
        : `replanning_policy_${replanning.action.toLowerCase()}`;
      this.logger.debug(
        `[LoopTrigger] in-trip skipped trip=${input.tripId} ${replanning.rationale}`,
      );
      await this.recordInTripGatewayDispatch(gatewayInput, { skipped: reason });
      return { action: 'skipped', reason };
    }

    const decisionRunId = await this.recordInTripGatewayDispatch(gatewayInput);

    const result = await this.orchestrator.runInTripRecovery({
      tripId: input.tripId,
      userId: input.userId,
      triggerEventId: input.triggerEventId ?? input.externalEventId,
      triggerType: input.triggerType,
      environmentEventId: input.environmentEventId ?? input.externalEventId,
      metadata: {
        triggerDedupeKey: dedupeKey,
        ...(decisionRunId ? { decisionRunId } : {}),
      },
    });

    return { action: 'started', result };
  }

  private buildInTripGatewayInput(
    input: InTripLoopTriggerInput,
    replanning: ReplanningTriggerResult,
    replanningDecision: ReturnType<typeof toReplanningTriggerDecision>,
    eventSeverity: 'LOW' | 'MEDIUM' | 'HIGH',
    extra?: Record<string, unknown>,
  ): DecisionTriggerInput {
    return {
      kind: 'IN_TRIP_DEVIATION',
      tripId: input.tripId,
      source: 'INTERNAL',
      userId: input.userId,
      eventId: input.environmentEventId ?? input.externalEventId ?? input.triggerEventId,
      metadata: {
        eventType: input.triggerType,
        eventSeverity,
        triggerType: input.triggerType,
        loopType: 'IN_TRIP_RECOVERY',
        replanningTrigger: replanning,
        replanningDecision,
        ...extra,
      },
    };
  }

  private async recordInTripGatewayDispatch(
    gatewayInput: DecisionTriggerInput,
    extra?: Record<string, unknown>,
  ): Promise<string | undefined> {
    try {
      const input = extra
        ? { ...gatewayInput, metadata: { ...gatewayInput.metadata, ...extra } }
        : gatewayInput;
      const dispatched = await dispatchInTripDeviationIfEnabled(this.triggerGateway, input);
      return resolveDecisionRunId(dispatched);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[loops.in-trip-recovery] Trigger Gateway dispatch failed (loop continues): ${message}`,
      );
      return undefined;
    }
  }

  private async shouldSkipDuplicate(
    tripId: string,
    dedupeKey: string,
    loopType: 'READINESS_REPAIR' | 'IN_TRIP_RECOVERY' = 'READINESS_REPAIR',
  ): Promise<string | null> {
    const latest = await this.repository.findLatestRun(tripId, loopType);
    if (!latest) return null;

    const cooldownMs = loopTriggerCooldownMs();
    const startedMs = Date.parse(latest.startedAt);
    const withinCooldown = Date.now() - startedMs < cooldownMs;

    if (latest.status === 'RUNNING') {
      return 'loop_already_running';
    }

    const metaKey = latest.metadata?.triggerDedupeKey;
    if (withinCooldown && metaKey === dedupeKey) {
      return 'duplicate_trigger_within_cooldown';
    }

    if (withinCooldown && latest.status === 'COMPLETED') {
      return 'recent_completed_loop';
    }

    return null;
  }

  private async emitTripSignal(input: LoopTriggerInput): Promise<void> {
    const eventType =
      input.triggerType === 'CONSTRAINT_CHANGED'
        ? TravelEventType.TRIP_CONSTRAINT_CHANGED
        : TravelEventType.TRIP_ITINERARY_CHANGED;

    const idempotencyKey = buildLoopIdempotencyKey([
      input.tripId,
      eventType,
      input.externalEventId ?? input.triggerEventId ?? Date.now(),
    ]);

    await this.loopEvents.emitTripSignal(
      input.tripId,
      eventType,
      {
        triggerType: input.triggerType,
        externalEventId: input.externalEventId,
        triggerEventId: input.triggerEventId,
      },
      idempotencyKey,
      { userId: input.userId },
    );
  }
}
