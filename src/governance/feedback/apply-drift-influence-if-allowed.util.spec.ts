import { applyDriftInfluenceIfAllowed } from './apply-drift-influence-if-allowed.util';

describe('applyDriftInfluenceIfAllowed', () => {
  it('returns empty when gate disabled', () => {
    const out = applyDriftInfluenceIfAllowed(
      [{ target: 'planner_weights', suggestedDelta: -0.2, confidence: 0.99, driftReasonCodes: ['x'] }],
      { enabled: false },
    );
    expect(out).toEqual([]);
  });

  it('filters by confidence and clamps delta', () => {
    const out = applyDriftInfluenceIfAllowed(
      [
        { target: 'planner_weights', suggestedDelta: -0.5, confidence: 0.9, driftReasonCodes: ['a'] },
        { target: 'search_constraints', suggestedDelta: 0.2, confidence: 0.2, driftReasonCodes: ['b'] },
      ],
      { enabled: true, minConfidence: 0.5, maxAbsDelta: 0.12 },
    );
    expect(out).toHaveLength(1);
    expect(out[0].suggestedDelta).toBe(-0.12);
  });
});
