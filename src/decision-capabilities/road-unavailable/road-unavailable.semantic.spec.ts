import {
  ROAD_SEGMENT_UNAVAILABLE,
  baseRoadSemanticCapability,
  buildRfc001ProblemSemanticKey,
  buildRoadSegmentUnavailableSemanticKey,
  normalizeRoadSemanticKey,
} from './road-unavailable.semantic';

describe('road-unavailable.semantic (Phase 3)', () => {
  it('SEM-001: builds canonical instance key', () => {
    expect(buildRoadSegmentUnavailableSemanticKey('evt_1')).toBe(
      'ROAD_SEGMENT_UNAVAILABLE:evt_1',
    );
  });

  it('SEM-002: RFC-001 problem → canonical key', () => {
    expect(buildRfc001ProblemSemanticKey('FEASIBILITY_FAILURE', 'evt_1')).toBe(
      'ROAD_SEGMENT_UNAVAILABLE:evt_1',
    );
  });

  it('SEM-003: normalizes legacy rfc001 prefixes', () => {
    expect(normalizeRoadSemanticKey('rfc001:road_close:evt_1')).toBe(
      'ROAD_SEGMENT_UNAVAILABLE:evt_1',
    );
    expect(normalizeRoadSemanticKey('rfc001:FEASIBILITY_FAILURE:evt_1')).toBe(
      'ROAD_SEGMENT_UNAVAILABLE:evt_1',
    );
  });

  it('SEM-004: base capability strips instance suffix', () => {
    expect(baseRoadSemanticCapability('ROAD_SEGMENT_UNAVAILABLE:evt_1')).toBe(
      ROAD_SEGMENT_UNAVAILABLE,
    );
    expect(
      baseRoadSemanticCapability('rfc001:FEASIBILITY_FAILURE:evt_1'),
    ).toBe(ROAD_SEGMENT_UNAVAILABLE);
  });
});
