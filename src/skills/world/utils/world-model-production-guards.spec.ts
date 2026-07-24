import {
  getBaselineRegionalRiskPenalty,
  isPlaceholderDemEvidence,
  resolvePhysicalRealityIncomplete,
} from './world-model-production-guards.util';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';

describe('world-model-production-guards', () => {
  it('detects placeholder DEM as incomplete signal', () => {
    expect(
      isPlaceholderDemEvidence({
        segmentId: 'placeholder_no_plan_yet',
        elevationProfile: [],
        cumulativeAscent: -1,
        maxSlopePct: -1,
        rollingAscent3Days: -1,
        fatigueIndex: -1,
        violation: 'UNKNOWN',
        explanation: 'x',
      }),
    ).toBe(true);
  });

  it('baseline regional penalty is non-zero for low accessibility', () => {
    const penalty = getBaselineRegionalRiskPenalty({
      demEvidence: [],
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      month: 1,
      climateSeasonality: {
        countryCode: 'IS',
        month: 1,
        accessibilityScore: 0.3,
        typicalWeather: {
          windSpeedMps: 12,
          precipitationMmPerHour: 2,
          visibilityMeters: 3000,
          temperatureCelsius: 2,
        },
      },
    });
    expect(penalty).toBeGreaterThan(0.12);
    expect(penalty).toBeLessThan(0.5);
  });

  it('baseline penalty avoids optimistic zero (case 3 score floor)', () => {
    const penalty = getBaselineRegionalRiskPenalty({
      demEvidence: [
        {
          segmentId: 'placeholder_no_plan_yet',
          elevationProfile: [],
          cumulativeAscent: -1,
          maxSlopePct: -1,
          rollingAscent3Days: -1,
          fatigueIndex: -1,
          violation: 'UNKNOWN',
          explanation: 'x',
        },
      ],
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      month: 7,
      climateSeasonality: {
        countryCode: 'IS',
        month: 7,
        accessibilityScore: 0.55,
        typicalWeather: {
          windSpeedMps: 8,
          precipitationMmPerHour: 1,
          visibilityMeters: 5000,
          temperatureCelsius: 10,
        },
      },
    });
    expect(penalty).toBeGreaterThan(0.15);
    expect(penalty).toBeLessThan(0.45);
  });

  it('resolvePhysicalRealityIncomplete reads environmentState and worldModelMeta', () => {
    const state: DecisionState = {
      requestId: 't1',
      environmentState: { physicalRealityIncomplete: true, countryCode: 'IS' },
    } as DecisionState;
    expect(resolvePhysicalRealityIncomplete(state)).toBe(true);

    const state2: DecisionState = {
      requestId: 't2',
      research_data: {
        worldModelMeta: { physicalRealityIncomplete: true },
      },
    } as DecisionState;
    expect(resolvePhysicalRealityIncomplete(state2)).toBe(true);
  });
});
