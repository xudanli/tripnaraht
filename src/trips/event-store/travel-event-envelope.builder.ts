import {
  DecisionEventType,
  type TripStateChangedEvent,
} from '../decision/optimization/events/decision-events';
import {
  TravelEventSource,
  TravelEventType,
  TrajectorySegment,
  type TravelEventBuilderOptions,
  type TravelEventEnvelope,
} from './types/travel-event.types';
import {
  buildTripStateChangedIdempotencyKey,
  eventIdFromIdempotencyKey,
} from './travel-event-idempotency.util';

export function buildTravelEventEnvelope(
  options: TravelEventBuilderOptions,
): TravelEventEnvelope {
  const eventId = eventIdFromIdempotencyKey(options.idempotencyKey);

  return {
    eventId,
    idempotencyKey: options.idempotencyKey,
    tripId: options.tripId,
    segment: options.segment,
    eventType: options.eventType,
    source: options.source ?? TravelEventSource.TRIP_LIFECYCLE,
    schemaVersion: options.schemaVersion ?? 1,
    payload: options.payload,
    userId: options.userId,
    timestamp: options.timestamp ?? new Date().toISOString(),
    requestId: options.requestId,
    metadata: options.metadata,
  };
}

/**
 * Map an in-process TRIP_STATE_CHANGED decision event to a durable travel event envelope.
 */
export function buildTripStateChangedEnvelope(
  event: TripStateChangedEvent,
): TravelEventEnvelope {
  const idempotencyKey = buildTripStateChangedIdempotencyKey(event);

  return buildTravelEventEnvelope({
    tripId: event.tripId,
    segment: TrajectorySegment.STATE,
    eventType: TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED,
    source: TravelEventSource.TRIP_LIFECYCLE,
    payload: {
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
    },
    userId: event.userId,
    requestId: event.requestId,
    timestamp: event.timestamp,
    metadata: {
      decisionEventType: DecisionEventType.TRIP_STATE_CHANGED,
    },
    idempotencyKey,
  });
}
