import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TravelEventPersistenceService } from '../../trips/event-store/travel-event-persistence.service';
import { TravelEventType } from '../../trips/event-store/types/travel-event.types';
import {
  buildLoopIdempotencyKey,
  buildLoopTravelEventEnvelope,
} from '../events/loop-event.builder';
import type {
  LoopBlockerDetectedPayload,
  LoopCompletedPayload,
  LoopRepairProposedPayload,
  LoopStartedPayload,
  LoopTravelEventContext,
  LoopValidationPayload,
} from '../events/loop-travel-event.types';
import type { LoopType } from '../types/loop-definition.types';

@Injectable()
export class LoopEventEmitterService {
  private readonly logger = new Logger(LoopEventEmitterService.name);

  constructor(
    @Optional() private readonly travelEvents?: TravelEventPersistenceService,
  ) {}

  createContext(input: {
    loopRunId: string;
    loopType: LoopType;
    correlationId?: string;
    causationId?: string;
  }): LoopTravelEventContext {
    return {
      loopRunId: input.loopRunId,
      loopType: input.loopType,
      correlationId: input.correlationId ?? input.loopRunId,
      causationId: input.causationId,
    };
  }

  async emitLoopStarted(
    tripId: string,
    ctx: LoopTravelEventContext,
    payload: LoopStartedPayload,
    opts?: { userId?: string; triggerEventId?: string },
  ): Promise<string | undefined> {
    const idempotencyKey = buildLoopIdempotencyKey([
      tripId,
      TravelEventType.LOOP_STARTED,
      ctx.loopRunId,
    ]);
    return this.persist(tripId, TravelEventType.LOOP_STARTED, payload, ctx, idempotencyKey, opts);
  }

  async emitBlockerDetected(
    tripId: string,
    ctx: LoopTravelEventContext,
    payload: LoopBlockerDetectedPayload,
  ): Promise<string | undefined> {
    const idempotencyKey = buildLoopIdempotencyKey([
      tripId,
      TravelEventType.LOOP_BLOCKER_DETECTED,
      ctx.loopRunId,
      payload.sequence,
      payload.issueId,
    ]);
    return this.persist(tripId, TravelEventType.LOOP_BLOCKER_DETECTED, payload, ctx, idempotencyKey);
  }

  async emitRepairProposed(
    tripId: string,
    ctx: LoopTravelEventContext,
    payload: LoopRepairProposedPayload,
  ): Promise<string | undefined> {
    const idempotencyKey = buildLoopIdempotencyKey([
      tripId,
      TravelEventType.LOOP_REPAIR_PROPOSED,
      ctx.loopRunId,
      payload.sequence,
      payload.optionId,
    ]);
    return this.persist(tripId, TravelEventType.LOOP_REPAIR_PROPOSED, payload, ctx, idempotencyKey);
  }

  async emitValidation(
    tripId: string,
    ctx: LoopTravelEventContext,
    payload: LoopValidationPayload,
    passed: boolean,
  ): Promise<string | undefined> {
    const eventType = passed
      ? TravelEventType.LOOP_VALIDATION_PASSED
      : TravelEventType.LOOP_VALIDATION_FAILED;
    const idempotencyKey = buildLoopIdempotencyKey([
      tripId,
      eventType,
      ctx.loopRunId,
      payload.sequence,
      payload.issueId,
    ]);
    return this.persist(tripId, eventType, payload, ctx, idempotencyKey);
  }

  async emitLoopCompleted(
    tripId: string,
    ctx: LoopTravelEventContext,
    payload: LoopCompletedPayload,
  ): Promise<string | undefined> {
    const idempotencyKey = buildLoopIdempotencyKey([
      tripId,
      TravelEventType.LOOP_COMPLETED,
      ctx.loopRunId,
      payload.status,
    ]);
    return this.persist(tripId, TravelEventType.LOOP_COMPLETED, payload, ctx, idempotencyKey);
  }

  async emitTripSignal(
    tripId: string,
    eventType: TravelEventType.TRIP_ITINERARY_CHANGED | TravelEventType.TRIP_CONSTRAINT_CHANGED,
    payload: Record<string, unknown>,
    idempotencyKey: string,
    opts?: { userId?: string },
  ): Promise<string | undefined> {
    const envelope = buildLoopTravelEventEnvelope({
      tripId,
      eventType,
      payload,
      ctx: {
        loopRunId: 'signal',
        loopType: 'READINESS_REPAIR',
        correlationId: idempotencyKey,
      },
      idempotencyKey,
      userId: opts?.userId,
    });
    return this.persistEnvelope(envelope);
  }

  newIterationId(): string {
    return `loop_iter_evt_${randomUUID()}`;
  }

  private async persist(
    tripId: string,
    eventType: TravelEventType,
    payload:
      | LoopStartedPayload
      | LoopBlockerDetectedPayload
      | LoopRepairProposedPayload
      | LoopValidationPayload
      | LoopCompletedPayload,
    ctx: LoopTravelEventContext,
    idempotencyKey: string,
    opts?: { userId?: string },
  ): Promise<string | undefined> {
    const envelope = buildLoopTravelEventEnvelope({
      tripId,
      eventType,
      payload: payload as unknown as Record<string, unknown>,
      ctx,
      idempotencyKey,
      userId: opts?.userId,
    });
    return this.persistEnvelope(envelope);
  }

  private async persistEnvelope(envelope: ReturnType<typeof buildLoopTravelEventEnvelope>): Promise<string | undefined> {
    if (!this.travelEvents?.isEnabled()) {
      return envelope.eventId;
    }
    try {
      const result = await this.travelEvents.persist(envelope);
      return result.eventId;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[LoopEvent] persist failed: ${message}`);
      return envelope.eventId;
    }
  }
}
