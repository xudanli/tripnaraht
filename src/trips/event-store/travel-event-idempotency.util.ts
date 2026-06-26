import { createHash } from 'node:crypto';
import type {
  TripStateChangedEvent,
  TripTransitionRejectedEvent,
} from '../decision/optimization/events/decision-events';
import { normalizeTripStatus } from '../dto/trip-status.dto';
import { TravelEventType } from './types/travel-event.types';

function normalizeMissingConditions(
  missingConditions?: string[],
): string {
  if (!missingConditions || missingConditions.length === 0) {
    return '';
  }
  return [...missingConditions].sort().join(',');
}

/**
 * Build a stable idempotency key for lifecycle state change events.
 */
export function buildTripStateChangedIdempotencyKey(
  event: Pick<
    TripStateChangedEvent,
    'tripId' | 'previousStatus' | 'newStatus' | 'timestamp' | 'userId'
  >,
): string {
  const parts = [
    event.tripId,
    TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED,
    event.previousStatus,
    event.newStatus,
    event.timestamp,
    event.userId ?? '',
  ];
  return parts.join('|');
}

/**
 * Build a stable idempotency key for lifecycle transition rejection events.
 */
export function buildTripTransitionRejectedIdempotencyKey(
  event: Pick<
    TripTransitionRejectedEvent,
    | 'tripId'
    | 'currentStatus'
    | 'attemptedStatus'
    | 'reason'
    | 'userId'
    | 'missingConditions'
  >,
): string {
  const parts = [
    event.tripId,
    TravelEventType.TRIP_LIFECYCLE_TRANSITION_REJECTED,
    normalizeTripStatus(event.currentStatus),
    normalizeTripStatus(event.attemptedStatus),
    event.reason,
    normalizeMissingConditions(event.missingConditions),
    event.userId ?? '',
  ];
  return parts.join('|');
}

/**
 * Derive a stable event ID from an idempotency key.
 */
export function eventIdFromIdempotencyKey(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32);
}
