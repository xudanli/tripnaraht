import {
  buildGate1RuntimeEnvelope,
  buildGate1RuntimeIdempotencyKey,
} from './gate1-runtime-event.builder';
import {
  RuntimeAggregateType,
  RuntimeCanonicalEventType,
  RuntimePrivacyClass,
  Gate1TravelEventType,
} from '../types/runtime-event-catalog';
import {
  TravelEventSource,
  TrajectorySegment,
} from '../../trips/event-store/types/travel-event.types';

describe('buildGate1RuntimeEnvelope', () => {
  const anchor = {
    tripId: 'trip-abc',
    gate1ProjectId: 'proj-123',
    organizationId: 'org-456',
  };

  it('maps DECISION_RECORDED to gate1 runtime envelope with v2 metadata', () => {
    const idempotencyKey = buildGate1RuntimeIdempotencyKey([
      anchor.gate1ProjectId,
      RuntimeCanonicalEventType.DECISION_RECORDED,
      'decision-1',
    ]);

    const envelope = buildGate1RuntimeEnvelope({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.DECISION_RECORDED,
      aggregateType: RuntimeAggregateType.DECISION_CASE,
      aggregateId: 'decision-1',
      payload: { materialChange: true, changeTypes: ['ROUTE'] },
      actor: { type: 'USER', id: 'advisor-1', role: 'ADVISOR' },
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey,
      timestamp: '2026-06-25T10:00:00.000Z',
    });

    expect(envelope.tripId).toBe('trip-abc');
    expect(envelope.eventType).toBe(Gate1TravelEventType.DECISION_RECORDED);
    expect(envelope.segment).toBe(TrajectorySegment.DECISION);
    expect(envelope.source).toBe(TravelEventSource.GATE1_RUNTIME);
    expect(envelope.schemaVersion).toBe(2);
    expect(envelope.userId).toBe('advisor-1');
    expect(envelope.payload).toMatchObject({
      gate1ProjectId: 'proj-123',
      materialChange: true,
    });
    expect(envelope.metadata?.runtime).toMatchObject({
      envelopeVersion: 2,
      canonicalEventType: RuntimeCanonicalEventType.DECISION_RECORDED,
      aggregateType: RuntimeAggregateType.DECISION_CASE,
      aggregateId: 'decision-1',
      gate1ProjectId: 'proj-123',
      organizationId: 'org-456',
      privacyClass: RuntimePrivacyClass.TEAM,
    });
  });

  it('uses stable idempotency key and derived event id', () => {
    const key = buildGate1RuntimeIdempotencyKey(['a', 'b', null, undefined, 1]);
    expect(key).toBe('a|b|||1');

    const envelope = buildGate1RuntimeEnvelope({
      anchor,
      canonicalEventType: RuntimeCanonicalEventType.OUTCOME_RECORDED,
      aggregateType: RuntimeAggregateType.EXECUTION_RECORD,
      aggregateId: 'outcome-1',
      payload: {},
      actor: { type: 'USER', id: 'u1' },
      privacyClass: RuntimePrivacyClass.TEAM,
      idempotencyKey: key,
    });

    expect(envelope.idempotencyKey).toBe(key);
    expect(envelope.eventId).toHaveLength(32);
    expect(
      buildGate1RuntimeEnvelope({
        anchor,
        canonicalEventType: RuntimeCanonicalEventType.OUTCOME_RECORDED,
        aggregateType: RuntimeAggregateType.EXECUTION_RECORD,
        aggregateId: 'outcome-1',
        payload: {},
        actor: { type: 'USER', id: 'u1' },
        privacyClass: RuntimePrivacyClass.TEAM,
        idempotencyKey: key,
      }).eventId,
    ).toBe(envelope.eventId);
  });
});
