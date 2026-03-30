import {
  alternativesReadabilityIssues,
  alternativesSatisfyBlockedGateMin,
  countTripAlternativesFromOrchestratorShape,
} from './alternatives-min-contract';

describe('alternatives-min-contract (TD-03)', () => {
  it('counts POI and route alternatives', () => {
    expect(
      countTripAlternativesFromOrchestratorShape({
        alternative_pois: [{ poi_id: 'p1' }],
        alternative_routes: [{ route_id: 'r1' }, { route_id: 'r2' }],
      }),
    ).toBe(3);
  });

  it('BLOCK requires at least one alternative', () => {
    expect(alternativesSatisfyBlockedGateMin('BLOCK', {}).ok).toBe(false);
    expect(
      alternativesSatisfyBlockedGateMin('BLOCK', {
        alternative_pois: [{ poi_id: 'p1', name: 'X', reason: 'y', evidence_status: 'UNVERIFIED' }],
      }).ok,
    ).toBe(true);
  });

  it('non-BLOCK gates do not enforce alternatives', () => {
    expect(alternativesSatisfyBlockedGateMin('ALLOW', {}).ok).toBe(true);
  });

  it('alternativesReadabilityIssues flags empty reason on POI', () => {
    const issues = alternativesReadabilityIssues({
      alternative_pois: [
        { poi_id: 'p1', name: 'X', reason: '', evidence_status: 'UNVERIFIED' },
      ],
      alternative_routes: [],
    });
    expect(issues.some((x) => x.includes('reason'))).toBe(true);
  });

  it('alternativesReadabilityIssues flags whitespace-only POI name', () => {
    const issues = alternativesReadabilityIssues({
      alternative_pois: [{ poi_id: 'p1', name: '   ', reason: 'ok', evidence_status: 'UNVERIFIED' }],
      alternative_routes: [],
    });
    expect(issues.some((x) => x.includes('name'))).toBe(true);
  });

  it('alternativesReadabilityIssues flags whitespace-only route description', () => {
    const issues = alternativesReadabilityIssues({
      alternative_pois: [],
      alternative_routes: [
        { route_id: 'r1', description: '\t', reason: 'ok', evidence_status: 'UNVERIFIED' },
      ],
    });
    expect(issues.some((x) => x.includes('description'))).toBe(true);
  });

  it('countTripAlternativesFromOrchestratorShape returns 0 for null', () => {
    expect(countTripAlternativesFromOrchestratorShape(null)).toBe(0);
  });

  it('alternativesReadabilityIssues flags missing poi_id on POI', () => {
    const issues = alternativesReadabilityIssues({
      alternative_pois: [
        { name: 'X', reason: 'y', evidence_status: 'UNVERIFIED' },
      ],
      alternative_routes: [],
    });
    expect(issues.some((x) => x.includes('poi_id'))).toBe(true);
  });

  it('alternativesReadabilityIssues flags missing route_id on route', () => {
    const issues = alternativesReadabilityIssues({
      alternative_pois: [],
      alternative_routes: [
        { description: 'Detour', reason: 'ok', evidence_status: 'UNVERIFIED' },
      ],
    });
    expect(issues.some((x) => x.includes('route_id'))).toBe(true);
  });

  it('alternativesReadabilityIssues passes for well-formed POI and route', () => {
    expect(
      alternativesReadabilityIssues({
        alternative_pois: [
          {
            poi_id: 'p1',
            name: 'Blue Lagoon',
            reason: 'Closer to hotel',
            evidence_status: 'VERIFIED',
          },
        ],
        alternative_routes: [
          {
            route_id: 'r1',
            description: 'Coastal detour',
            reason: 'Avoids closed tunnel',
            evidence_status: 'UNVERIFIED',
          },
        ],
      }),
    ).toHaveLength(0);
  });
});
