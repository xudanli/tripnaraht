import { CGUSSearchService, type CGUSCandidate } from './cgus-search.service';
import { UnifiedDecisionFormulaService } from './unified-decision-formula.service';
import { PlanFeaturesService } from './plan-features/plan-features.service';
import { ExperienceRoutingPolicyService } from '../policies/experience-routing-policy.service';
import { MetaPolicyService } from './meta/meta-policy.service';
import { EXPERIENCE_FLOW_SCHEMA_V1 } from '../models/experience-flow.model';

describe('CGUSSearchService (ExperienceRoutingPolicy wiring)', () => {
  const unified = new UnifiedDecisionFormulaService();
  const planFeatures = new PlanFeaturesService();
  const metaPolicy = new MetaPolicyService();
  const routingPolicy = new ExperienceRoutingPolicyService(metaPolicy);

  const service = new CGUSSearchService(
    unified,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    planFeatures,
    undefined,
    undefined,
    routingPolicy,
  );

  const stormFlow = {
    schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
    tempo: 'EMPATHY_RECOVERY' as const,
    heterogeneityIndex: 0.35,
    surpriseBuffer: 0.05,
    currentFrictionCapacity: 0.2,
    narrativeTone: 'empathetic_reassurance',
  };

  const worldContext: any = {
    physical: {
      month: 1,
      roadStates: [{ status: 'CLOSED', roadId: 'IS-R1-SOUTH' }],
      climateSeasonality: {
        typicalWeather: { windSpeedMps: 25, precipitationMmPerHour: 14 },
        accessibilityScore: 0.4,
      },
    },
    human: { fitnessScore: 50, riskTolerance: 'LOW' },
    routeDirection: { id: 'rd-is', name: 'South Coast' },
    experienceFlow: stormFlow,
  };

  function segment(dayIndex: number, dist: number, ascent: number, type: string, fRoad = false) {
    return {
      dayIndex,
      distanceKm: dist,
      ascentM: ascent,
      slopePct: ascent / Math.max(1, dist) * 10,
      segmentId: `s-${dayIndex}-${type}`,
      metadata: { type, fRoad },
    };
  }

  it('ranks low-friction indoor/safe candidate above high-friction F-road plan under EMPATHY_RECOVERY', async () => {
    const highFriction: CGUSCandidate = {
      id: 'froad-heavy',
      feasible: true,
      constraintViolations: [{ type: 'SOFT_TIME', severity: 'SOFT', degree: 0.3 }],
      plan: {
        tripId: 'storm',
        routeDirectionId: 'rd-is',
        segments: [
          segment(1, 140, 1200, 'DRIVE', true),
          segment(2, 90, 800, 'DRIVE', true),
          segment(3, 60, 500, 'DRIVE', true),
        ],
      } as CGUSCandidate['plan'],
    };

    const lowFriction: CGUSCandidate = {
      id: 'shelter-first',
      feasible: true,
      constraintViolations: [],
      plan: {
        tripId: 'storm',
        routeDirectionId: 'rd-is',
        segments: [
          segment(1, 12, 10, 'POI'),
          segment(2, 8, 5, 'POI'),
          segment(3, 10, 8, 'POI'),
        ],
      } as CGUSCandidate['plan'],
    };

    const result = await service.search([highFriction, lowFriction], worldContext, {
      useMonteCarlo: false,
      useWorldModelRollout: false,
      explorationStrategy: 'NONE',
    });

    expect(result.experienceRoutingAudit?.weights.w2).toBe(1.35);
    expect(result.experienceRoutingAudit?.tempo).toBe('EMPATHY_RECOVERY');
    expect(
      result.experienceRoutingAudit?.perCandidate['froad-heavy']?.generalizedCost,
    ).toBeGreaterThan(result.experienceRoutingAudit?.perCandidate['shelter-first']?.generalizedCost ?? 0);
    expect(result.rankedCandidates[0].candidate.id).toBe('shelter-first');
  });

  it('caps exploration beta under empathy recovery even when caller passes higher beta', async () => {
    const candidate: CGUSCandidate = {
      id: 'only',
      feasible: true,
      constraintViolations: [],
      plan: {
        tripId: 't',
        routeDirectionId: 'rd',
        segments: [segment(1, 20, 50, 'POI')],
      } as CGUSCandidate['plan'],
    };

    const informationGain: any = {
      computeInformationGain: jest.fn().mockReturnValue(0.5),
    };

    const svc = new CGUSSearchService(
      unified,
      undefined,
      undefined,
      undefined,
      informationGain,
      undefined,
      undefined,
      planFeatures,
      undefined,
      undefined,
      routingPolicy,
    );

    const result = await svc.search([candidate], worldContext, {
      useMonteCarlo: false,
      explorationStrategy: 'INFORMATION_GAIN',
      explorationBeta: 0.25,
    });

    expect(result.usedExploration).toBe(true);
    expect(result.experienceRoutingAudit?.weights.beta).toBeLessThanOrEqual(0.03);
  });
});
