import {
  resolveSemanticStaleRegionsV0,
  validateSemanticDeltaImpactV0,
} from './semantic-delta-impact-matrix';

describe('semantic-delta-impact-matrix', () => {
  const baseImpact = {
    affectedDomains: ['WEATHER' as const],
    impactScope: 'GLOBAL' as const,
  };

  it('GLOBAL scope maps to FULL_SNAPSHOT stale region', () => {
    expect(
      resolveSemanticStaleRegionsV0({
        kind: 'WEATHER_UPDATE',
        payload: {},
        impact: baseImpact,
      }),
    ).toEqual(['FULL_SNAPSHOT']);
  });

  it('DAY scope uses kind matrix for weather', () => {
    expect(
      resolveSemanticStaleRegionsV0({
        kind: 'WEATHER_UPDATE',
        payload: {},
        impact: {
          affectedDomains: ['WEATHER'],
          impactScope: 'DAY',
          affectedDates: ['2026-06-01'],
        },
      }),
    ).toEqual(['EXECUTION_BY_DATE', 'GLOBAL_ALERTS']);
  });

  it('validateSemanticDeltaImpactV0 requires dates for DAY', () => {
    const r = validateSemanticDeltaImpactV0({
      kind: 'WEATHER_UPDATE',
      payload: {},
      impact: {
        affectedDomains: ['WEATHER'],
        impactScope: 'DAY',
      },
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes('affectedDates'))).toBe(true);
  });
});
