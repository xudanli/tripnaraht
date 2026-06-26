import { buildTravelEventEnvelope } from '../../trips/event-store/travel-event-envelope.builder';
import { eventIdFromIdempotencyKey } from '../../trips/event-store/travel-event-idempotency.util';
import {
  TrajectorySegment,
  TravelEventSource,
  TravelEventType,
  type TravelEventEnvelope,
} from '../../trips/event-store/types/travel-event.types';
import type { LoopTravelEventContext } from './loop-travel-event.types';

export interface BuildLoopTravelEventInput {
  tripId: string;
  eventType: TravelEventType;
  payload: Record<string, unknown>;
  ctx: LoopTravelEventContext;
  segment?: TrajectorySegment;
  userId?: string;
  requestId?: string;
  idempotencyKey: string;
}

export function buildLoopTravelEventEnvelope(input: BuildLoopTravelEventInput): TravelEventEnvelope {
  return buildTravelEventEnvelope({
    tripId: input.tripId,
    segment: input.segment ?? TrajectorySegment.DECISION,
    eventType: input.eventType,
    source: TravelEventSource.LOOP_ORCHESTRATOR,
    payload: {
      ...input.payload,
      loopRunId: input.ctx.loopRunId,
      loopType: input.ctx.loopType,
      iterationId: input.ctx.iterationId,
      iterationSequence: input.ctx.iterationSequence,
      correlationId: input.ctx.correlationId,
      causationId: input.ctx.causationId,
      evidenceRefs: input.ctx.evidenceRefs,
      confidence: input.ctx.confidence,
    },
    userId: input.userId,
    requestId: input.requestId,
    metadata: {
      loopRunId: input.ctx.loopRunId,
      correlationId: input.ctx.correlationId,
      causationId: input.ctx.causationId,
    },
    idempotencyKey: input.idempotencyKey,
  });
}

export function loopEventIdFromKey(idempotencyKey: string): string {
  return eventIdFromIdempotencyKey(idempotencyKey);
}

export function buildLoopIdempotencyKey(parts: Array<string | number | undefined>): string {
  return parts.filter((p) => p !== undefined && p !== '').join('|');
}
