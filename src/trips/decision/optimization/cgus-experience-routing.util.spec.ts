import type { CGUSCandidate } from './cgus-search.service';
import {
  derivePlanEdgeMetrics,
  evaluateCandidateExperienceRouting,
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
});
