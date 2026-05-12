import {
  applyAccumulatedFatigueRule,
  applyBehaviorSignal,
  createDefaultUserIntentState,
} from './intent-evolution.engine';

describe('intent-evolution.engine', () => {
  it('createDefaultUserIntentState seeds neutral profile', () => {
    const s = createDefaultUserIntentState('u1');
    expect(s.userId).toBe('u1');
    expect(s.longTermProfile.preferredPace).toBe(0.5);
    expect(s.behaviorMemory.acceptedPlaceIds).toEqual([]);
  });

  it('fatigue_rejection lowers preferredPace', () => {
    const base = createDefaultUserIntentState('u1');
    const next = applyBehaviorSignal(base, {
      type: 'fatigue_rejection',
      signal: 'too_intense',
      targetSlot: 'afternoon',
      confidence: 1,
    });
    expect(next.longTermProfile.preferredPace).toBeLessThan(base.longTermProfile.preferredPace);
    expect(next.behaviorMemory.overridePatterns.some((p) => p.includes('fatigue'))).toBe(true);
  });

  it('explicit_favorite records place id', () => {
    const base = createDefaultUserIntentState('u1');
    const next = applyBehaviorSignal(base, {
      type: 'explicit_favorite',
      placeId: 42,
      confidence: 1,
    });
    expect(next.behaviorMemory.acceptedPlaceIds).toContain(42);
  });

  it('applyAccumulatedFatigueRule tightens pace after threshold', () => {
    const base = createDefaultUserIntentState('u1');
    const next = applyAccumulatedFatigueRule(base, 5);
    expect(next.longTermProfile.preferredPace).toBeLessThan(base.longTermProfile.preferredPace);
  });
});
