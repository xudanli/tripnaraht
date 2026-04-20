import { ExpectedUtilityService } from './expected-utility.service';
import { PlanFeaturesService } from '../plan-features/plan-features.service';
import { ExposureMapService } from '../plan-features/exposure-map.service';
import { ProbabilisticWorldModelService } from './probabilistic-world-model.service';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../objective-function.interface';
import type { ObjectiveFunctionService } from '../objective-function.service';

describe('ExpectedUtilityService (plan-conditioned)', () => {
  it('should produce different E[U] / P(feasible) for structurally different plans under same context', () => {
    const planFeatures = new PlanFeaturesService();
    const objectiveStub = { evaluate: jest.fn() } as unknown as ObjectiveFunctionService;
    const eu = new ExpectedUtilityService(planFeatures, new ExposureMapService(), objectiveStub);
    const pwm = new ProbabilisticWorldModelService(new ExposureMapService());

    const deterministicWorldContext: any = {
      physical: {
        month: 1,
        climateSeasonality: { accessibilityScore: 0.55 },
        roadStates: [{ roadId: 'r1', status: 'OPEN', metadata: {} }],
        hazardZones: [{ type: 'AVALANCHE', level: 'MEDIUM', seasonality: { highRiskMonths: [12, 1, 2] } }],
      },
      human: {
        maxDailyAscentM: 900,
        rollingAscent3DaysM: 2500,
        fitnessLevel: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        preferredPace: 'MODERATE',
        confidenceLevel: 'MEDIUM',
      },
      routeDirection: { id: 'rd-1', name: 'RD', philosophy: {}, constraints: {} },
    };

    const ctx = pwm.fromDeterministicModel(deterministicWorldContext);

    const planRelaxed: any = {
      tripId: 't1',
      routeDirectionId: 'rd-1',
      segments: [
        { dayIndex: 0, distanceKm: 8, ascentM: 200, segmentId: 's1' },
        { dayIndex: 1, distanceKm: 10, ascentM: 300, segmentId: 's2' },
      ],
    };

    const planDense: any = {
      tripId: 't2',
      routeDirectionId: 'rd-1',
      segments: [
        { dayIndex: 0, distanceKm: 12, ascentM: 600, segmentId: 'd1' },
        { dayIndex: 0, distanceKm: 10, ascentM: 500, segmentId: 'd2' },
        { dayIndex: 0, distanceKm: 8, ascentM: 450, segmentId: 'd3' },
        { dayIndex: 1, distanceKm: 14, ascentM: 700, segmentId: 'd4' },
        { dayIndex: 1, distanceKm: 12, ascentM: 650, segmentId: 'd5' },
      ],
    };

    const r1 = eu.computeExpectedUtility(planRelaxed, ctx, DEFAULT_OBJECTIVE_WEIGHTS, { sampleSize: 400, seed: 42 });
    const r2 = eu.computeExpectedUtility(planDense, ctx, DEFAULT_OBJECTIVE_WEIGHTS, { sampleSize: 400, seed: 42 });

    // Dense plan should generally be more fragile => lower feasibility and/or lower utility.
    expect(r1.expectedUtility).not.toBeNaN();
    expect(r2.expectedUtility).not.toBeNaN();

    const euDiff = Math.abs(r1.expectedUtility - r2.expectedUtility);
    const fpDiff = Math.abs(r1.feasibilityProbability - r2.feasibilityProbability);

    expect(euDiff + fpDiff).toBeGreaterThan(0.05);
  }, 20000);
});

