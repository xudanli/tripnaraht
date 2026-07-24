import {
  buildPersonaConstraintWeights,
  resolvePersonaSnapshotFromOdysseyBranch,
} from './adaptive-replan-persona.util';

describe('adaptive-replan-persona.util', () => {
  it('increases buffer and thins POIs when fatigue > 70', () => {
    const weights = buildPersonaConstraintWeights({
      travelStyle: 'leisure_chill',
      energyModel: {
        currentFatigueLevel: 82,
        maxDailyPoiCount: 4,
        bufferRatio: 1.2,
      },
      socialBoundary: 'standard',
    });
    expect(weights.structuralThinning).toBe(true);
    expect(weights.maxDailyPoiCount).toBeLessThanOrEqual(2);
    expect(weights.bufferRatio).toBeGreaterThanOrEqual(1.5);
    expect(weights.earliestStartLocal).toBe('10:00');
  });

  it('resolves default persona snapshot', () => {
    const snapshot = resolvePersonaSnapshotFromOdysseyBranch(undefined, {
      travelStyle: 'adventure',
    });
    expect(snapshot.travelStyle).toBe('adventure');
    expect(snapshot.energyModel.maxDailyPoiCount).toBe(5);
  });
});
