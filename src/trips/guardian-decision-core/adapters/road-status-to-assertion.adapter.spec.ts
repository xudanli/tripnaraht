import {
  assertionImpliesHardClosure,
  buildEvidenceRefForRoad,
  roadStatusChangedToAssertion,
} from './road-status-to-assertion.adapter';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';

describe('road-status-to-assertion.adapter', () => {
  it('maps CLOSED to road.status assertion with evidence and validUntil', () => {
    const observedAt = '2026-06-30T10:22:00.000Z';
    const evidenceRef = buildEvidenceRefForRoad('trip_abc', 'F208', observedAt);
    const assertion = roadStatusChangedToAssertion({
      tripId: 'trip_abc',
      roadId: 'F208',
      segmentId: 'trip-trip_abc-item-item1',
      status: 'CLOSED',
      evidenceRef,
      sourceProvider: 'road.is_api',
      observedAt,
      confidence: 0.9,
    });

    expect(assertion.predicate).toBe('road.status');
    expect(assertion.payload.status).toBe('CLOSED');
    expect(assertion.source.sourceType).toBe('OFFICIAL');
    expect(assertion.source.evidenceRefs).toContain(evidenceRef);
    expect(assertion.validUntil).toBeDefined();
    expect(assertion.status).toBe('ACTIVE');
    expect(assertionImpliesHardClosure(assertion)).toBe(true);
  });

  it('UNKNOWN maps to DISPUTED assertion status — not ACTIVE pass', () => {
    const assertion = roadStatusChangedToAssertion({
      tripId: 'trip_abc',
      roadId: 'F208',
      status: 'UNKNOWN',
      evidenceRef: 'ev_test',
      sourceProvider: 'road.is_api',
      observedAt: '2026-06-30T10:22:00.000Z',
      confidence: 0.4,
    });
    expect(assertion.status).toBe('DISPUTED');
    expect(assertion.payload.status).toBe('UNKNOWN');
    expect(assertionImpliesHardClosure(assertion)).toBe(false);
  });

  it('hard closure aligns with ROAD_SEGMENT_CLOSED reason code domain', () => {
    const assertion = roadStatusChangedToAssertion({
      tripId: 't1',
      roadId: 'F208',
      status: 'CLOSED',
      evidenceRef: 'ev1',
      sourceProvider: 'road.is_api',
      observedAt: '2026-06-30T10:00:00.000Z',
      confidence: 0.95,
    });
    expect(assertionImpliesHardClosure(assertion)).toBe(true);
    expect(RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED).toBe('ROAD_SEGMENT_CLOSED');
  });
});
