import { buildDeparturePreparationScore } from './departure-preparation-score.util';
import type { ReadinessCheckResult } from '../types/readiness-findings.types';

describe('departure-preparation-score.util', () => {
  it('returns 100 when no pack items', () => {
    const score = buildDeparturePreparationScore({ findings: [], summary: {} as any });
    expect(score.overall).toBe(100);
    expect(score.entryTransit).toBe(100);
  });

  it('penalizes blockers in entry_transit', () => {
    const result: ReadinessCheckResult = {
      findings: [
        {
          destinationId: 'IS',
          packId: 'pack.is',
          packVersion: '1',
          blockers: [
            {
              id: 'visa',
              category: 'entry_transit',
              severity: 'high',
              level: 'blocker',
              message: '需要签证',
            },
          ],
          must: [],
          should: [],
          optional: [],
          risks: [],
        },
      ],
      summary: {
        totalBlockers: 1,
        totalMust: 0,
        totalShould: 0,
        totalOptional: 0,
        totalRisks: 0,
      },
    };
    const score = buildDeparturePreparationScore(result);
    expect(score.entryTransit).toBeLessThan(100);
    expect(score.overall).toBeLessThan(100);
  });
});
