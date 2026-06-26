import { buildCompatibility, recommendSplitMechanisms } from './split-mechanism.util';
import type { MoneyDnaCard } from '../types/decision-profiling.types';

function card(userId: string, overrides: Partial<MoneyDnaCard> = {}): MoneyDnaCard {
  return {
    userId,
    vector: {
      experienceTendency: 0.5,
      qualityTendency: 0.5,
      timeValueTendency: 0.5,
      socialScarcityTendency: 0.5,
    },
    consumptionPace: 'balanced',
    budgetRangeMin: 800,
    budgetRangeMax: 2000,
    confidence: 0.7,
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('split-mechanism.util', () => {
  it('rates highly similar team as high compatibility', () => {
    const compat = buildCompatibility([card('a'), card('b')]);
    expect(compat.overallScore).toBeGreaterThanOrEqual(70);
    expect(compat.band).toBe('high');
  });

  it('recommends AA for high style similarity', () => {
    const compat = buildCompatibility([card('a'), card('b')]);
    const options = recommendSplitMechanisms(compat);
    expect(options[0].mode).toBe('split_aa');
  });
});
