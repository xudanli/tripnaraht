import {
  DecisionEventType,
  type TripStateChangedEvent,
  type TripTransitionRejectedEvent,
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
  buildTripTransitionRejectedIdempotencyKey,
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
    attribution: options.attribution,
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

/**
 * Map an in-process TRIP_TRANSITION_REJECTED decision event to a durable travel event envelope.
 */
export function buildTripTransitionRejectedEnvelope(
  event: TripTransitionRejectedEvent,
): TravelEventEnvelope {
  const idempotencyKey = buildTripTransitionRejectedIdempotencyKey(event);
  const payload: Record<string, unknown> = {
    currentStatus: event.currentStatus,
    attemptedStatus: event.attemptedStatus,
    reason: event.reason,
  };

  if (event.missingConditions && event.missingConditions.length > 0) {
    payload.missingConditions = event.missingConditions;
  }

  return buildTravelEventEnvelope({
    tripId: event.tripId,
    segment: TrajectorySegment.STATE,
    eventType: TravelEventType.TRIP_LIFECYCLE_TRANSITION_REJECTED,
    source: TravelEventSource.TRIP_LIFECYCLE,
    payload,
    userId: event.userId,
    requestId: event.requestId,
    timestamp: event.timestamp,
    metadata: {
      decisionEventType: DecisionEventType.TRIP_TRANSITION_REJECTED,
      verification: 'verified',
    },
    idempotencyKey,
  });
}
