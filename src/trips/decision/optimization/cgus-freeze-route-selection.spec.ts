import { CGUSSearchService, type CGUSCandidate } from './cgus-search.service';
import { UnifiedDecisionFormulaService } from './unified-decision-formula.service';
import { routeSkeletonSignature } from './cgus-route-skeleton.util';

describe('CGUSSearchService — freezeRouteSelection', () => {
  const unified = new UnifiedDecisionFormulaService();
  const service = new CGUSSearchService(unified);

  const skeletonPlan = {
    tripId: 't',
    routeDirectionId: 'rd',
    segments: [
      { dayIndex: 0, segmentId: 'a', distanceKm: 10 },
      { dayIndex: 0, segmentId: 'b', distanceKm: 20 },
    ],
  };

  const divergentPlan = {
    tripId: 't',
    routeDirectionId: 'rd',
    segments: [{ dayIndex: 0, segmentId: 'only-one', distanceKm: 5 }],
  };

  const worldContext: any = {
    physical: {
      month: 7,
      demEvidence: [],
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      climateSeasonality: { countryCode: 'IS', month: 7, accessibilityScore: 0.6 },
    },
    human: {
      profileId: 'p',
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 25,
      preferredPace: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      highAltitudeExperience: 'BASIC',
    },
    routeDirection: { id: 'rd', countryCode: 'IS', name: 'x', nameCN: 'x', nameEN: 'x', tags: [], philosophy: '' },
  };

  it('drops candidates that change route skeleton when freezeRouteSelection is true', async () => {
    const candidates: CGUSCandidate[] = [
      { id: 'anchor', plan: skeletonPlan as any, feasible: true, constraintViolations: [] },
      { id: 'divergent', plan: divergentPlan as any, feasible: true, constraintViolations: [] },
    ];
    expect(routeSkeletonSignature(skeletonPlan as any)).not.toBe(routeSkeletonSignature(divergentPlan as any));

    const result = await service.search(candidates, worldContext, {
      freezeRouteSelection: true,
      useMonteCarlo: false,
      useUtilityPrior: false,
    });

    expect(result.usedMonteCarlo).toBe(false);
    const rankedIds = result.rankedCandidates.map((r) => r.candidate.id);
    expect(rankedIds).not.toContain('divergent');
    expect(rankedIds[0]).toBe('anchor');
  });
});
