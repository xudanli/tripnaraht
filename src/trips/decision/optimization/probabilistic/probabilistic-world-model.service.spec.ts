import { ProbabilisticWorldModelService } from './probabilistic-world-model.service';
import { PlanFeaturesService } from '../plan-features/plan-features.service';
import { ExposureMapService } from '../plan-features/exposure-map.service';

describe('ProbabilisticWorldModelService predictOutcome (plan-conditioned)', () => {
  it('PLAN_EVALUATION should reflect plan features in feasibility/utility', () => {
    const pwm = new ProbabilisticWorldModelService(new ExposureMapService());
    const pf = new PlanFeaturesService();

    const deterministicWorldContext: any = {
      physical: {
        month: 1,
        climateSeasonality: { accessibilityScore: 0.45 },
        roadStates: [{ roadId: 'r1', status: 'RESTRICTED', metadata: {} }],
        hazardZones: [{ type: 'AVALANCHE', level: 'HIGH', seasonality: { highRiskMonths: [12, 1, 2] } }],
      },
      human: {
        maxDailyAscentM: 850,
        rollingAscent3DaysM: 2400,
        fitnessLevel: 'LOW',
        riskTolerance: 'LOW',
        preferredPace: 'SLOW',
        confidenceLevel: 'LOW',
      },
      routeDirection: { id: 'rd-1', name: 'RD', philosophy: {}, constraints: {} },
    };

    const ctx = pwm.fromDeterministicModel(deterministicWorldContext);

    const relaxed: any = {
      tripId: 't1',
      routeDirectionId: 'rd-1',
      segments: [
        { dayIndex: 0, distanceKm: 6, ascentM: 150, segmentId: 's1' },
        { dayIndex: 1, distanceKm: 7, ascentM: 200, segmentId: 's2' },
      ],
    };

    const dense: any = {
      tripId: 't2',
      routeDirectionId: 'rd-1',
      segments: [
        { dayIndex: 0, distanceKm: 14, ascentM: 800, segmentId: 'd1' },
        { dayIndex: 0, distanceKm: 12, ascentM: 700, segmentId: 'd2' },
        { dayIndex: 0, distanceKm: 10, ascentM: 650, segmentId: 'd3' },
        { dayIndex: 1, distanceKm: 16, ascentM: 900, segmentId: 'd4' },
      ],
    };

    const outRelaxed = pwm.predictOutcome(ctx, {
      type: 'PLAN_EVALUATION',
      payload: { planFeatures: pf.extract(relaxed), exposure: new ExposureMapService().extract(relaxed) },
    });
    const outDense = pwm.predictOutcome(ctx, {
      type: 'PLAN_EVALUATION',
      payload: { planFeatures: pf.extract(dense), exposure: new ExposureMapService().extract(dense) },
    });

    expect(outRelaxed.feasibilityProbability).toBeGreaterThan(outDense.feasibilityProbability);
    expect(outRelaxed.estimatedUtility).toBeGreaterThan(outDense.estimatedUtility);
  });
});

