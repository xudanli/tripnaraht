import type { CGUSCandidate } from './cgus-search.service';
import {
  EXPERIENCE_ROUTING_REFERENCE_COST_PER_DAY,
  derivePlanEdgeMetrics,
  evaluateCandidateExperienceRouting,
  experienceCostToUtilityPenalty,
  softmaxWeightsFromEdgeCosts,
} from './cgus-experience-routing.util';
import { resolveExperienceRoutingWeights } from '../policies/experience-routing-policy';
import { EXPERIENCE_FLOW_SCHEMA_V1 } from '../models/experience-flow.model';

function makeCandidate(id: string, segments: Array<Record<string, unknown>>): CGUSCandidate {
  return {
    id,
    feasible: true,
    constraintViolations: [],
    plan: {
      tripId: 't-storm',
      routeDirectionId: 'rd-is',
      segments,
    } as CGUSCandidate['plan'],
  };
}

describe('cgus-experience-routing.util', () => {
  const stormFlow = {
    schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
    tempo: 'EMPATHY_RECOVERY' as const,
    heterogeneityIndex: 0.35,
    surpriseBuffer: 0.05,
    currentFrictionCapacity: 0.2,
    narrativeTone: 'empathetic_reassurance',
  };

  const calmFlow = {
    ...stormFlow,
    tempo: 'ACCELERATED' as const,
    currentFrictionCapacity: 0.72,
    surpriseBuffer: 0.35,
  };

  const stormWorld: any = {
    physical: {
      roadStates: [{ status: 'CLOSED', roadId: 'IS-R1-SOUTH' }],
      climateSeasonality: {
        typicalWeather: { windSpeedMps: 25, precipitationMmPerHour: 12 },
      },
    },
    human: { fitnessScore: 55, riskTolerance: 'LOW' },
    routeDirection: { id: 'rd' },
    experienceFlow: stormFlow,
  };

  const calmWorld: any = {
    ...stormWorld,
    physical: {
      roadStates: [{ status: 'OPEN', roadId: 'IS-R1-SOUTH' }],
      climateSeasonality: {
        typicalWeather: { windSpeedMps: 5, precipitationMmPerHour: 0 },
      },
    },
    experienceFlow: calmFlow,
  };

  it('storm EMPATHY_RECOVERY inflates friction-heavy plan generalized cost', () => {
    const highFriction = makeCandidate('high', [
      { dayIndex: 1, distanceKm: 120, ascentM: 900, slopePct: 22, metadata: { type: 'DRIVE', fRoad: true } },
      { dayIndex: 2, distanceKm: 80, ascentM: 600, slopePct: 18, metadata: { type: 'DRIVE', fRoad: true } },
    ]);
    const lowFriction = makeCandidate('low', [
      { dayIndex: 1, distanceKm: 15, ascentM: 20, slopePct: 2, metadata: { type: 'POI' } },
      { dayIndex: 2, distanceKm: 10, ascentM: 10, slopePct: 1, metadata: { type: 'POI' } },
    ]);

    const weights = resolveExperienceRoutingWeights({
      experienceFlow: stormFlow,
      mode: 'EMPATHY_RECOVERY',
    });
    const high = evaluateCandidateExperienceRouting(highFriction, stormWorld, weights);
    const low = evaluateCandidateExperienceRouting(lowFriction, stormWorld, weights);

    expect(weights.wFriction).toBe(1.35);
    expect(high.generalizedCost).toBeGreaterThan(low.generalizedCost);
    expect(high.utilityPenalty).toBeGreaterThan(low.utilityPenalty);
  });

  it('softmax favors lower generalized edge cost under empathy temperature', () => {
    const weights = softmaxWeightsFromEdgeCosts([180, 40], 0.75);
    expect(weights[1]).toBeGreaterThan(weights[0]);
    expect(weights.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
  });

  it('derivePlanEdgeMetrics increases friction when roads closed', () => {
    const candidate = makeCandidate('c', [
      { dayIndex: 1, distanceKm: 40, ascentM: 100, slopePct: 8 },
    ]);
    const stormMetrics = derivePlanEdgeMetrics(candidate, stormWorld);
    const calmMetrics = derivePlanEdgeMetrics(candidate, calmWorld);
    expect(stormMetrics.frictionScore).toBeGreaterThan(calmMetrics.frictionScore);
  });

  it('multi-day south-coast mileage does not saturate utilityPenalty via total minutes', () => {
    // ~246 km over 8 active days (Iceland south coast style) — previously always hit 0.42
    const multiDay = makeCandidate('is-south', [
      { dayIndex: 1, distanceKm: 40, ascentM: 80, slopePct: 4, metadata: { type: 'DRIVE' } },
      { dayIndex: 2, distanceKm: 35, ascentM: 60, slopePct: 3, metadata: { type: 'DRIVE' } },
      { dayIndex: 3, distanceKm: 30, ascentM: 120, slopePct: 5, metadata: { type: 'DRIVE' } },
      { dayIndex: 4, distanceKm: 28, ascentM: 200, slopePct: 6, metadata: { type: 'DRIVE' } },
      { dayIndex: 5, distanceKm: 25, ascentM: 150, slopePct: 5, metadata: { type: 'DRIVE' } },
      { dayIndex: 6, distanceKm: 32, ascentM: 90, slopePct: 4, metadata: { type: 'DRIVE' } },
      { dayIndex: 7, distanceKm: 30, ascentM: 70, slopePct: 3, metadata: { type: 'DRIVE' } },
      { dayIndex: 8, distanceKm: 26, ascentM: 50, slopePct: 2, metadata: { type: 'DRIVE' } },
    ]);
    const balancedWorld: any = {
      physical: {
        roadStates: [{ status: 'OPEN', roadId: 'IS-R1' }],
        climateSeasonality: { typicalWeather: { windSpeedMps: 8, precipitationMmPerHour: 1 } },
      },
      human: { fitnessScore: 70, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd' },
      experienceFlow: {
        schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
        tempo: 'BALANCED',
        heterogeneityIndex: 0.55,
        surpriseBuffer: 0.2,
        currentFrictionCapacity: 0.58,
        narrativeTone: 'balanced_warm',
      },
    };
    const weights = resolveExperienceRoutingWeights({
      experienceFlow: balancedWorld.experienceFlow,
      mode: 'DEFAULT',
    });
    const audit = evaluateCandidateExperienceRouting(multiDay, balancedWorld, weights);
    const metrics = derivePlanEdgeMetrics(multiDay, balancedWorld);

    // Day-mean intensity (~30 min/day), not ~270 total minutes
    expect(metrics.physicalTimeMin).toBeLessThan(60);
    expect(audit.utilityPenalty).toBeLessThan(0.42);
    expect(audit.utilityPenalty).toBeLessThan(
      experienceCostToUtilityPenalty(270, 0.42, EXPERIENCE_ROUTING_REFERENCE_COST_PER_DAY),
    );
    expect(audit.utilityPenalty).toBeCloseTo(
      experienceCostToUtilityPenalty(audit.generalizedCost),
      5,
    );
  });
});
