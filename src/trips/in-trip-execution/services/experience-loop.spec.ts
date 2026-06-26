import {
  buildTriggerKey,
  clampDelta,
  computeEmotionPolarity,
} from '../utils/experience-pulse.util';

describe('experience-pulse.util', () => {
  it('computes emotion polarity from scores', () => {
    expect(computeEmotionPolarity({ emotionalValueScore: 5 })).toBe(1);
    expect(computeEmotionPolarity({ emotionalValueScore: 1 })).toBe(-1);
    expect(computeEmotionPolarity({})).toBeNull();
  });

  it('builds stable trigger keys', () => {
    expect(buildTriggerKey('daily_review', { day: 3 })).toBe('daily_review:day=3');
  });

  it('clamps weight deltas', () => {
    expect(clampDelta(1.5)).toBe(1);
    expect(clampDelta(-2)).toBe(-1);
  });
});
