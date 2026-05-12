import {
  buildAuroraOpportunityByDate,
  buildAuroraOpportunitySignal,
  rankAuroraOpportunityDates,
} from './build-aurora-opportunity';
import type { AuroraNightObservationSignal } from './aurora-night-signals.types';

describe('buildAuroraOpportunitySignal', () => {
  it('ranks higher KP + thinner cloud above low KP + clear sky (chase utility)', () => {
    const day2: AuroraNightObservationSignal = {
      kpIndex: 2,
      cloudCoveragePct: 10,
      visibility: 'moderate',
      observationFeasibility: 'feasible',
      updatedAt: new Date().toISOString(),
    };
    const day3: AuroraNightObservationSignal = {
      kpIndex: 5,
      cloudCoveragePct: 50,
      visibility: 'moderate',
      observationFeasibility: 'feasible',
      updatedAt: new Date().toISOString(),
    };

    const o2 = buildAuroraOpportunitySignal('2026-01-02', day2);
    const o3 = buildAuroraOpportunitySignal('2026-01-03', day3);
    expect(o3.opportunityScore).toBeGreaterThan(o2.opportunityScore);
    const ranked = rankAuroraOpportunityDates({
      '2026-01-02': o2,
      '2026-01-03': o3,
    });
    expect(ranked[0]).toBe('2026-01-03');
  });

  it('buildAuroraOpportunityByDate maps all dates', () => {
    const byDate: Partial<Record<string, AuroraNightObservationSignal>> = {
      '2026-01-04': {
        kpIndex: 4,
        cloudCoveragePct: 20,
        visibility: 'high',
        observationFeasibility: 'feasible',
        updatedAt: new Date().toISOString(),
      },
    };
    const opp = buildAuroraOpportunityByDate(byDate);
    expect(opp['2026-01-04']?.observationTier).toBeDefined();
    expect(opp['2026-01-04']?.recommendedObservationWindow).toBeDefined();
  });
});
