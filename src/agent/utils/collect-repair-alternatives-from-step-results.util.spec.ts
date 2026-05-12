import {
  collectRepairAlternativesFromStepResults,
  mergeRepairAlternativesBundles,
} from './collect-repair-alternatives-from-step-results.util';

describe('collect-repair-alternatives-from-step-results.util', () => {
  it('collects top-level and nested result.alternatives', () => {
    const from = collectRepairAlternativesFromStepResults({
      s1: {
        alternative_pois: [
          { poi_id: 'p1', name: 'A', reason: 'r1', evidence_status: 'VERIFIED' as const },
        ],
        alternative_routes: [],
      },
      s2: {
        result: {
          alternatives: {
            alternative_pois: [{ poi_id: 'p2', name: 'B', reason: 'r2', evidence_status: 'ASSUMPTION' as const }],
            alternative_routes: [
              {
                route_id: 'rt1',
                description: 'd',
                reason: 'rr',
                evidence_status: 'UNVERIFIED' as const,
              },
            ],
          },
        },
      },
    });
    expect(from.alternative_pois.map((p) => p.poi_id).sort()).toEqual(['p1', 'p2']);
    expect(from.alternative_routes[0].route_id).toBe('rt1');
  });

  it('mergeRepairAlternativesBundles: explicit overrides same id from steps', () => {
    const merged = mergeRepairAlternativesBundles(
      {
        alternative_pois: [{ poi_id: 'p1', name: 'Override', reason: 'x', evidence_status: 'VERIFIED' }],
      },
      {
        alternative_pois: [{ poi_id: 'p1', name: 'FromStep', reason: 'y', evidence_status: 'UNVERIFIED' }],
        alternative_routes: [],
      },
    );
    expect(merged.alternative_pois).toHaveLength(1);
    expect(merged.alternative_pois[0].name).toBe('Override');
  });
});
