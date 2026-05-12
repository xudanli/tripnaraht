import {
  computeArtifactUtilityScore,
  depreciateUtilityScore,
  reinforceUtilityScore,
} from './cognitive-market.util';

describe('cognitive-market.util', () => {
  it('computeArtifactUtilityScore is in 0..1', () => {
    const u = computeArtifactUtilityScore({
      successRate: 1,
      reuseRate: 1,
      anomalyReduction: 1,
    });
    expect(u).toBe(1);
  });

  it('depreciateUtilityScore applies anomaly penalty', () => {
    expect(depreciateUtilityScore(1, { usageDecay: 0, anomalyPenalty: 0.2 })).toBe(0.8);
    expect(depreciateUtilityScore(0.8, { usageDecay: 0.25, anomalyPenalty: 0 })).toBeCloseTo(0.6);
  });

  it('reinforceUtilityScore bumps toward 1', () => {
    expect(reinforceUtilityScore(0.5, 1)).toBeGreaterThan(0.5);
  });
});
