import { createHash } from 'node:crypto';
import type { TripStateChangedEvent } from '../decision/optimization/events/decision-events';
import { TravelEventType } from './types/travel-event.types';

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
 * Derive a stable event ID from an idempotency key.
 */
export function eventIdFromIdempotencyKey(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32);
}
