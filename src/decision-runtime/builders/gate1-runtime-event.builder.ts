import { eventIdFromIdempotencyKey } from '../../trips/event-store/travel-event-idempotency.util';
import { buildTravelEventEnvelope } from '../../trips/event-store/travel-event-envelope.builder';
import {
  TravelEventSource,
  type TravelEventEnvelope,
} from '../../trips/event-store/types/travel-event.types';
import {
  GATE1_EVENT_SEGMENT,
  RUNTIME_EVENT_IMPLEMENTATION,
  type Gate1TravelEventTypeName,
} from '../types/runtime-event-catalog';
import type { BuildGate1RuntimeEnvelopeInput } from '../types/runtime-envelope.types';

export function buildGate1RuntimeIdempotencyKey(
  parts: (string | number | boolean | null | undefined)[],
): string {
  return parts.map((p) => (p == null ? '' : String(p))).join('|');
}

export function buildGate1RuntimeEnvelope(
  input: BuildGate1RuntimeEnvelopeInput,
): TravelEventEnvelope {
  const eventType = RUNTIME_EVENT_IMPLEMENTATION[input.canonicalEventType];
  const segment =
    GATE1_EVENT_SEGMENT[eventType as Gate1TravelEventTypeName] ??
    GATE1_EVENT_SEGMENT['gate1.decision.recorded'];

  const runtimeContext = {
    envelopeVersion: 2 as const,
    canonicalEventType: input.canonicalEventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    aggregateVersion: input.aggregateVersion,
    gate1ProjectId: input.anchor.gate1ProjectId,
    organizationId: input.anchor.organizationId,
    actor: input.actor,
    privacyClass: input.privacyClass,
    correlationId: input.correlationId,
  };

  return buildTravelEventEnvelope({
    tripId: input.anchor.tripId,
    segment,
    eventType,
    source: TravelEventSource.GATE1_RUNTIME,
    schemaVersion: 2,
    payload: {
      gate1ProjectId: input.anchor.gate1ProjectId,
      ...input.payload,
    },
    userId: input.actor.type === 'USER' ? input.actor.id : undefined,
    requestId: input.requestId,
    metadata: {
      runtime: runtimeContext,
      sourceModule: 'gate1',
    },
    timestamp: input.timestamp ?? new Date().toISOString(),
    idempotencyKey: input.idempotencyKey,
  });
}

export { eventIdFromIdempotencyKey };
