import { DecisionEventType } from '../decision/optimization/events/decision-events';
import { buildTripStateChangedEnvelope, buildTripTransitionRejectedEnvelope } from './travel-event-envelope.builder';
import {
  TravelEventSource,
  TravelEventType,
  TrajectorySegment,
} from './types/travel-event.types';
import { buildTripStateChangedIdempotencyKey, buildTripTransitionRejectedIdempotencyKey } from './travel-event-idempotency.util';

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

describe('buildTripTransitionRejectedEnvelope', () => {
  const baseEvent = {
    type: DecisionEventType.TRIP_TRANSITION_REJECTED as const,
    timestamp: '2026-06-15T12:00:00.000Z',
    tripId: 'trip-123',
    currentStatus: 'CANCELLED',
    attemptedStatus: 'PLANNING',
    reason: '不允许从 CANCELLED 转换到 PLANNING',
    missingConditions: ['计划确认'],
    userId: 'user-456',
  };

  it('maps TRIP_TRANSITION_REJECTED to STATE segment travel event', () => {
    const envelope = buildTripTransitionRejectedEnvelope(baseEvent);

    expect(envelope.segment).toBe(TrajectorySegment.STATE);
    expect(envelope.eventType).toBe(TravelEventType.TRIP_LIFECYCLE_TRANSITION_REJECTED);
    expect(envelope.source).toBe(TravelEventSource.TRIP_LIFECYCLE);
    expect(envelope.payload).toEqual({
      currentStatus: 'CANCELLED',
      attemptedStatus: 'PLANNING',
      reason: '不允许从 CANCELLED 转换到 PLANNING',
      missingConditions: ['计划确认'],
    });
    expect(envelope.metadata).toEqual({
      decisionEventType: DecisionEventType.TRIP_TRANSITION_REJECTED,
      verification: 'verified',
    });
  });

  it('uses stable idempotency key and derived event id', () => {
    const envelope = buildTripTransitionRejectedEnvelope(baseEvent);
    const expectedKey = buildTripTransitionRejectedIdempotencyKey(baseEvent);

    expect(envelope.idempotencyKey).toBe(expectedKey);
    expect(envelope.eventId).toHaveLength(32);
  });

  it('dedupes identical rejections regardless of timestamp', () => {
    const first = buildTripTransitionRejectedEnvelope({
      ...baseEvent,
      timestamp: '2026-06-15T12:00:00.000Z',
    });
    const second = buildTripTransitionRejectedEnvelope({
      ...baseEvent,
      timestamp: '2026-06-15T12:00:00.500Z',
    });

    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.eventId).toBe(second.eventId);
  });

  it('normalizes statuses and missingConditions in idempotency key', () => {
    const fromLegacyStatus = buildTripTransitionRejectedIdempotencyKey({
      tripId: 'trip-123',
      currentStatus: 'IN_PROGRESS',
      attemptedStatus: 'PLANNING',
      reason: 'blocked',
      missingConditions: ['b', 'a'],
      userId: 'user-1',
    });
    const normalized = buildTripTransitionRejectedIdempotencyKey({
      tripId: 'trip-123',
      currentStatus: 'TRAVELING',
      attemptedStatus: 'PLANNING',
      reason: 'blocked',
      missingConditions: ['a', 'b'],
      userId: 'user-1',
    });

    expect(fromLegacyStatus).toBe(normalized);
  });
});
