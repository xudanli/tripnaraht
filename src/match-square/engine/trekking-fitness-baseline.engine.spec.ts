import { applyPhysicalFailurePenalty, mergeTrekkingFitnessBaselines, projectBaselineFromHumanCapability } from './trekking-fitness-baseline.engine';
import type { TrekkingFitnessBaseline } from './types/physical-fitness-gate.types';

describe('trekking-fitness-baseline.engine', () => {
  it('merges stored trip history over questionnaire', () => {
    const merged = mergeTrekkingFitnessBaselines(
      {
        maxDailyAscentM: 1600,
        maxAltitudeM: 4800,
        maxPackWeightKg: 22,
        heavyPackCampingVerified: true,
        recentAerobicSessions30d: 10,
        source: 'trip_history',
        evidenceLabel: '2026-04 川西长毕穿',
      },
      {
        maxDailyAscentM: 700,
        maxAltitudeM: 1200,
        maxPackWeightKg: 10,
        heavyPackCampingVerified: false,
        recentAerobicSessions30d: 4,
        source: 'questionnaire',
        evidenceLabel: '体能问卷',
      },
    );
    expect(merged.maxDailyAscentM).toBe(1600);
    expect(merged.evidenceLabel).toBe('2026-04 川西长毕穿');
  });

  it('applies failure penalty for evacuation', () => {
    const penalized = applyPhysicalFailurePenalty(
      {
        maxDailyAscentM: 1600,
        maxAltitudeM: 4800,
        maxPackWeightKg: 22,
        heavyPackCampingVerified: true,
        recentAerobicSessions30d: 10,
        source: 'trip_history',
      },
      { eventType: 'mid_trip_evacuation' },
    );
    expect(penalized.maxDailyAscentM).toBeLessThan(1200);
    expect(penalized.heavyPackCampingVerified).toBe(false);
  });

  it('projects from human capability model', () => {
    const baseline = projectBaselineFromHumanCapability({
      profileId: 'u1',
      maxDailyAscentM: 1200,
      rollingAscent3DaysM: 3000,
      maxSlopePct: 25,
      preferredPace: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      highAltitudeExperience: 'ADVANCED',
      maxElevationM: 5000,
      questionnaireLongestHike: 4,
      completedTripCount: 2,
      fitnessScore: 80,
    });
    expect(baseline.maxDailyAscentM).toBe(1200);
    expect(baseline.heavyPackCampingVerified).toBe(true);
  });
});
