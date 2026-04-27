import { DEFAULT_OBJECTIVE_WEIGHTS } from '../../trips/decision/optimization/objective-function.interface';
import { mergeObjectiveWeightsWithStyleTags } from './preference-objective-weights.util';

describe('mergeObjectiveWeightsWithStyleTags', () => {
  it('returns undefined when no style tags', () => {
    expect(mergeObjectiveWeightsWithStyleTags(undefined)).toBeUndefined();
    expect(mergeObjectiveWeightsWithStyleTags([])).toBeUndefined();
  });

  it('boosts experienceDensity for 出片-style tags', () => {
    const w = mergeObjectiveWeightsWithStyleTags(['极致出片'], DEFAULT_OBJECTIVE_WEIGHTS)!;
    expect(w.experienceDensity).toBeGreaterThan(DEFAULT_OBJECTIVE_WEIGHTS.experienceDensity);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('raises philosophyAlignment for 静谧-style tags', () => {
    const w = mergeObjectiveWeightsWithStyleTags(['深度静谧'], DEFAULT_OBJECTIVE_WEIGHTS)!;
    expect(w.philosophyAlignment).toBeGreaterThan(DEFAULT_OBJECTIVE_WEIGHTS.philosophyAlignment);
    expect(w.experienceDensity).toBeLessThan(DEFAULT_OBJECTIVE_WEIGHTS.experienceDensity);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});
