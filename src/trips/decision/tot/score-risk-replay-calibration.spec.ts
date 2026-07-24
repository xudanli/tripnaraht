import { COUNTRY_DECISION_CLOSURE_FIXTURES } from '../evaluation/e2e-cases/registry';
import { scoreRisk } from './dimension-scorers';
import {
  buildScoreRiskReplayClosureScenarios,
  summarizeReplayScoresByCountry,
} from './score-risk-replay-calibration.util';

describe('score-risk replay calibration (closure golden)', () => {
  const scenarios = buildScoreRiskReplayClosureScenarios(COUNTRY_DECISION_CLOSURE_FIXTURES);

  it('derives one scenario per country closure fixture', () => {
    expect(scenarios.length).toBe(COUNTRY_DECISION_CLOSURE_FIXTURES.length);
    expect(scenarios.every((s) => s.id.startsWith('replay-'))).toBe(true);
  });

  it('stress fixtures score lower than stable fixtures', () => {
    const results = scenarios.map((s) => ({
      id: s.id,
      ...scoreRisk(s.world, s.plan, s.optimizationResult),
    }));
    for (const s of scenarios) {
      const r = results.find((x) => x.id === s.id)!;
      if (s.maxScore !== undefined) {
        expect(r.score).toBeLessThanOrEqual(s.maxScore + 0.01);
      }
    }
    const f208 = results.find((r) => r.id.includes('storm-f208'));
    const ring = results.find((r) => r.id.includes('ring-stable'));
    if (f208 && ring) {
      expect(f208.score).toBeLessThan(ring.score);
    }
  });

  it('summarizes by country bucket', () => {
    const results = scenarios.map((s) => ({
      id: s.id,
      ...scoreRisk(s.world, s.plan, s.optimizationResult),
    }));
    const buckets = summarizeReplayScoresByCountry(results, COUNTRY_DECISION_CLOSURE_FIXTURES);
    expect(buckets.some((b) => b.countryCode === 'IS')).toBe(true);
    expect(buckets.every((b) => b.fixtureCount >= 1)).toBe(true);
  });
});
