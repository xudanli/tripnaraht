/**
 * Golden Path CGUS — 风暴候选、世界上下文与真实 CGUSSearchService.search() 接线。
 */
import type { CGUSCandidate, CGUSSearchResult } from '../../trips/decision/optimization/cgus-search.service';
import { CGUSSearchService } from '../../trips/decision/optimization/cgus-search.service';
import { UnifiedDecisionFormulaService } from '../../trips/decision/optimization/unified-decision-formula.service';
import { PlanFeaturesService } from '../../trips/decision/optimization/plan-features/plan-features.service';
import { ExperienceRoutingPolicyService } from '../../trips/decision/policies/experience-routing-policy.service';
import { MetaPolicyService } from '../../trips/decision/optimization/meta/meta-policy.service';
import type { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import type { GoldenPathIncidentResult } from './iceland-storm-golden-path.harness';

function segment(
  dayIndex: number,
  dist: number,
  ascent: number,
  type: string,
  fRoad = false,
) {
  return {
    dayIndex,
    distanceKm: dist,
    ascentM: ascent,
    slopePct: ascent / Math.max(1, dist) * 10,
    segmentId: `gp-${dayIndex}-${type}`,
    metadata: { type, fRoad },
  };
}

export function buildGoldenPathStormCandidates(): {
  highFriction: CGUSCandidate;
  lowFriction: CGUSCandidate;
} {
  return {
    highFriction: {
      id: 'froad-heavy',
      feasible: true,
      constraintViolations: [{ type: 'SOFT_TIME', severity: 'SOFT', degree: 0.3 }],
      plan: {
        tripId: 'golden-path-storm',
        routeDirectionId: 'rd-is-south',
        segments: [
          segment(1, 140, 1200, 'DRIVE', true),
          segment(2, 90, 800, 'DRIVE', true),
          segment(3, 60, 500, 'DRIVE', true),
        ],
      } as CGUSCandidate['plan'],
    },
    lowFriction: {
      id: 'shelter-first',
      feasible: true,
      constraintViolations: [],
      plan: {
        tripId: 'golden-path-storm',
        routeDirectionId: 'rd-is-south',
        segments: [
          segment(1, 12, 10, 'POI'),
          segment(2, 8, 5, 'POI'),
          segment(3, 10, 8, 'POI'),
        ],
      } as CGUSCandidate['plan'],
    },
  };
}

export function buildStormWorldContextFromIncident(
  incident: GoldenPathIncidentResult,
): WorldModelContext {
  return {
    ...incident.world,
    physical: {
      ...incident.world.physical,
      roadStates: [{ roadId: 'IS-R1-SOUTH', status: 'CLOSED' as const }],
      climateSeasonality: {
        countryCode: 'IS',
        month: 1,
        typicalWeather: {
          windSpeedMps: 25,
          precipitationMmPerHour: 12,
          visibilityMeters: 200,
          temperatureCelsius: -2,
        },
        accessibilityScore: 0.35,
      },
    },
    human: {
      profileId: 'golden-path-storm',
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 25,
      preferredPace: 'MEDIUM',
      riskTolerance: 'LOW',
      highAltitudeExperience: 'BASIC',
    },
    experienceFlow: incident.experienceFlow,
  };
}

export function createGoldenPathCgusSearchService(
  metaPolicy: MetaPolicyService = new MetaPolicyService(),
): CGUSSearchService {
  const routingPolicy = new ExperienceRoutingPolicyService(metaPolicy);
  return new CGUSSearchService(
    new UnifiedDecisionFormulaService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new PlanFeaturesService(),
    undefined,
    undefined,
    routingPolicy,
  );
}

/** 真实 CGUSSearchService.search() — ExperienceRoutingPolicy 全链路 */
export async function runGoldenPathCgusSearch(
  incident: GoldenPathIncidentResult,
  metaPolicy: MetaPolicyService = new MetaPolicyService(),
): Promise<CGUSSearchResult> {
  const world = buildStormWorldContextFromIncident(incident);
  const { highFriction, lowFriction } = buildGoldenPathStormCandidates();
  const service = createGoldenPathCgusSearchService(metaPolicy);
  return service.search([highFriction, lowFriction], world, {
    useMonteCarlo: false,
    useWorldModelRollout: false,
    explorationStrategy: 'NONE',
  });
}

export type GoldenPathExperienceRoutingAudit = NonNullable<
  CGUSSearchResult['experienceRoutingAudit']
>;

/** 供 capture / 门禁复用的确定性校验（无 jest expect） */
export function validateGoldenPathExperienceRoutingAudit(
  cgus: CGUSSearchResult,
): GoldenPathExperienceRoutingAudit {
  const audit = cgus.experienceRoutingAudit;
  if (!audit) {
    throw new Error('Golden Path CGUS: missing experienceRoutingAudit');
  }
  if (audit.tempo !== 'EMPATHY_RECOVERY') {
    throw new Error(`Golden Path CGUS: expected tempo EMPATHY_RECOVERY, got ${audit.tempo}`);
  }
  if (audit.weights.w2 !== 1.35) {
    throw new Error(`Golden Path CGUS: expected w2=1.35, got ${audit.weights.w2}`);
  }
  if (audit.weights.beta > 0.03) {
    throw new Error(`Golden Path CGUS: expected beta<=0.03, got ${audit.weights.beta}`);
  }

  const heavy = audit.perCandidate['froad-heavy'];
  const shelter = audit.perCandidate['shelter-first'];
  if (!heavy || !shelter) {
    throw new Error('Golden Path CGUS: perCandidate missing froad-heavy or shelter-first');
  }
  if (heavy.generalizedCost <= shelter.generalizedCost) {
    throw new Error(
      `Golden Path CGUS: froad-heavy cost (${heavy.generalizedCost}) must exceed shelter-first (${shelter.generalizedCost})`,
    );
  }
  if (heavy.frictionScore <= shelter.frictionScore) {
    throw new Error('Golden Path CGUS: froad-heavy frictionScore must exceed shelter-first');
  }

  const winnerId = cgus.rankedCandidates[0]?.candidate.id;
  if (winnerId !== 'shelter-first') {
    throw new Error(`Golden Path CGUS: expected shelter-first winner, got ${winnerId ?? 'none'}`);
  }

  return audit;
}
