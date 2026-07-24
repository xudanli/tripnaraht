import {
  iterateSoftWeightsFromSamples,
  parseSoftWeights,
} from './soft-weight-iteration.engine';
import { DEFAULT_SOFT_MATCH_WEIGHTS } from '../types/match-learning.types';
import type { WeightIterationSample } from '../types/match-learning.types';

function makeSample(
  overrides: Partial<WeightIterationSample> & {
    q1?: number;
    q3?: number;
    q5?: number;
  },
): WeightIterationSample {
  const basePersona = {
    mbtiType: 'INTJ',
    dimensionPercents: { E: 30, I: 70, T: 60, F: 40, J: 80, P: 20 },
    rawScores: { financial_flexibility: 0, energy_capacity: 2, ambiguity_tolerance: 1 },
  };

  return {
    q1Overall: overrides.q1 ?? 5,
    q2PaceSync: 4,
    q3Communication: overrides.q3 ?? 5,
    q4Spending: 4,
    q5WouldAgain: overrides.q5 ?? 5,
    reviewerPersona: basePersona,
    revieweePersona: {
      ...basePersona,
      dimensionPercents: { E: 70, I: 30, T: 40, F: 60, J: 20, P: 80 },
      rawScores: { financial_flexibility: 2, energy_capacity: 0, ambiguity_tolerance: 0 },
    },
    ...overrides,
  };
}

describe('soft-weight-iteration.engine', () => {
  it('parseSoftWeights falls back on invalid input', () => {
    expect(parseSoftWeights(null)).toEqual(DEFAULT_SOFT_MATCH_WEIGHTS);
  });

  it('boosts weights on positive samples', () => {
    const result = iterateSoftWeightsFromSamples(DEFAULT_SOFT_MATCH_WEIGHTS, [
      makeSample({ q1: 5, q5: 5 }),
      makeSample({ q1: 4, q5: 4 }),
    ]);

    expect(result.positiveSamples).toBe(2);
    expect(result.weightAfter.energy).toBeDefined();
    const sum =
      result.weightAfter.ei +
      result.weightAfter.tf +
      result.weightAfter.energy +
      result.weightAfter.ambiguity;
    expect(sum).toBeCloseTo(1, 3);
  });

  it('increases conflict dimension weights on negative samples', () => {
    const result = iterateSoftWeightsFromSamples(DEFAULT_SOFT_MATCH_WEIGHTS, [
      makeSample({ q1: 1, q3: 1, q5: 1 }),
    ]);

    expect(result.negativeSamples).toBe(1);
    expect(result.adjustments.energy).toBeGreaterThan(0);
  });

  it('skips when no actionable samples', () => {
    const result = iterateSoftWeightsFromSamples(DEFAULT_SOFT_MATCH_WEIGHTS, [
      makeSample({ q1: 3, q3: 3, q5: 3 }),
    ]);
    expect(result.skippedReason).toBe('no_actionable_samples');
  });
});
