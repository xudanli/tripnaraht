import { DecisionEventType } from '../decision/optimization/events/decision-events';
import { buildTripStateChangedEnvelope } from './travel-event-envelope.builder';
import {
  TravelEventSource,
  TravelEventType,
  TrajectorySegment,
} from './types/travel-event.types';
import { buildTripStateChangedIdempotencyKey } from './travel-event-idempotency.util';

describe('TravelEvent envelope builder', () => {
  const baseEvent = {
    type: DecisionEventType.TRIP_STATE_CHANGED as const,
    timestamp: '2026-06-15T12:00:00.000Z',
    tripId: 'trip-123',
    previousStatus: 'RECRUITING',
    newStatus: 'FORMING',
    userId: 'user-456',
  };

  it('maps TRIP_STATE_CHANGED to STATE segment travel event', () => {
    const envelope = buildTripStateChangedEnvelope(baseEvent);

    expect(envelope.tripId).toBe('trip-123');
    expect(envelope.segment).toBe(TrajectorySegment.STATE);
    expect(envelope.eventType).toBe(TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED);
    expect(envelope.source).toBe(TravelEventSource.TRIP_LIFECYCLE);
    expect(envelope.payload).toEqual({
      previousStatus: 'RECRUITING',
      newStatus: 'FORMING',
    });
    expect(envelope.userId).toBe('user-456');
    expect(envelope.metadata).toEqual({
      decisionEventType: DecisionEventType.TRIP_STATE_CHANGED,
    });
  });

  it('uses stable idempotency key and derived event id', () => {
    const envelope = buildTripStateChangedEnvelope(baseEvent);
    const expectedKey = buildTripStateChangedIdempotencyKey(baseEvent);

    expect(envelope.idempotencyKey).toBe(expectedKey);
    expect(envelope.eventId).toHaveLength(32);
    expect(buildTripStateChangedEnvelope(baseEvent).eventId).toBe(envelope.eventId);
  });
});
