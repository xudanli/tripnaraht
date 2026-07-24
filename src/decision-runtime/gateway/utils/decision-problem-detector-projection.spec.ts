import {
  buildDetectorsFromLegacyDetail,
  buildOriginFromCanonical,
  mergeDetectors,
} from './decision-problem-detector-projection.util';

describe('decision-problem-detector-projection.util', () => {
  it('projects legacy detectors from detectedBy and sourceRefs', () => {
    const detectors = buildDetectorsFromLegacyDetail({
      id: 'p1',
      tripId: 'trip1',
      type: 'INFEASIBILITY',
      title: 'F208',
      description: 'closed',
      detectedBy: 'FEASIBILITY',
      detectedAt: '2026-07-03T00:00:00Z',
      tripVersion: '1',
      affectedScope: [],
      status: 'OPEN',
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
      sourceRefs: [{ system: 'FEASIBILITY', refId: 'issue-1' }],
      assertionIds: [],
      assertions: [
        {
          id: 'a1',
          sourceSystem: 'GATE',
          sourceRefId: 'gate-1',
          nature: 'HARD_CONSTRAINT',
          domain: 'ROUTE',
          enforcement: 'BLOCK',
          overridable: false,
          condition: 'c',
          conclusion: 'x',
          proofs: [],
        },
      ],
    });

    expect(detectors.map((d) => d.detectorId)).toEqual(
      expect.arrayContaining(['FEASIBILITY', 'GATE']),
    );
  });

  it('merges detectors when aggregating duplicate instance keys', () => {
    const merged = mergeDetectors(
      [{ detectorId: 'FEASIBILITY', label: '可行性分析', sourceRefIds: ['a'] }],
      [{ detectorId: 'GATE', label: 'Plan Gate', sourceRefIds: ['b'] }],
    );
    expect(merged).toHaveLength(2);
  });

  it('builds canonical origin with triggerEventId', () => {
    const origin = buildOriginFromCanonical({
      problemId: 'problem_f208',
      problemSummary: {} as never,
      rfc001Problem: {
        triggerEventId: 'evt-1',
        semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
      } as never,
      options: [],
    } as never);
    expect(origin.authority).toBe('CANONICAL');
    expect(origin.triggerEventId).toBe('evt-1');
  });
});
