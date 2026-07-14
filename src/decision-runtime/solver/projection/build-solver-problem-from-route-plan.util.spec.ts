import { buildSolverProblemFromRoutePlan } from './build-solver-problem-from-route-plan.util';
import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import type { RoadCloseImpactResult } from '../../../trips/guardian-decision-core/detection/road-close-impact.types';

describe('buildSolverProblemFromRoutePlan', () => {
  const plan: RoutePlanDraft = {
    tripId: 't1',
    routeDirectionId: 'rd',
    segments: [
      {
        segmentId: 's1',
        dayIndex: 0,
        distanceKm: 20,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: 'a1', poiId: 'p1', roadIds: ['F208'] },
      },
      {
        segmentId: 's2',
        dayIndex: 0,
        distanceKm: 25,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: 'a2', poiId: 'p2', roadIds: ['F208'] },
      },
      {
        segmentId: 's3',
        dayIndex: 0,
        distanceKm: 15,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: 'a3', poiId: 'p3' },
      },
    ],
  };

  const impact: RoadCloseImpactResult = {
    roadId: 'F208',
    matchedSegmentIds: ['s1', 's2'],
    affectedPlanItemIds: ['a1', 'a2'],
    affectedEntityRefs: [],
    downstreamItemIds: [],
    matchedSegments: [],
  };

  it('returns null when day has fewer than 2 stops', () => {
    const thin: RoutePlanDraft = {
      ...plan,
      segments: plan.segments.slice(0, 1),
    };
    expect(
      buildSolverProblemFromRoutePlan({
        requestId: 'r1',
        tripId: 't1',
        planVersionId: 'pv',
        plan: thin,
        impact,
      }),
    ).toBeNull();
  });

  it('projects EDGE_FORBIDDEN for closed road hops', () => {
    const problem = buildSolverProblemFromRoutePlan({
      requestId: 'r1',
      tripId: 't1',
      planVersionId: 'pv',
      plan,
      impact,
      bindings: { byItemId: { a1: ['F208'], a2: ['F208'] } },
    });
    expect(problem).not.toBeNull();
    expect(problem!.operation).toBe('REROUTE');
    expect(problem!.nodes[0].nodeId).toBe('depot');
    expect(
      problem!.constraints.some(
        (c) => c.kind === 'EDGE_FORBIDDEN' && c.canonicalConstraintId === 'road.close.F208',
      ),
    ).toBe(true);
  });

  it('stamps REPLACE_POOL alts and uses travelFromPreviousDurationMin in matrix', () => {
    const withTravel: RoutePlanDraft = {
      ...plan,
      segments: plan.segments.map((s, i) => ({
        ...s,
        metadata: {
          ...s.metadata,
          travelFromPreviousDurationMin: 40 + i * 10,
          serviceDurationMin: 45,
          // Iceland fixture: seljalandsfoss → skogafoss
          ...(i === 0 ? { poiId: 'is.seljalandsfoss' } : {}),
        },
      })),
    };
    const problem = buildSolverProblemFromRoutePlan({
      requestId: 'r1',
      tripId: 't1',
      planVersionId: 'pv',
      plan: withTravel,
      impact,
      bindings: { byItemId: { a1: ['F208'], a2: ['F208'] } },
    });
    expect(problem).not.toBeNull();
    expect(
      problem!.constraints.some(
        (c) =>
          c.kind === 'REPLACE_POOL' &&
          c.payload.fromNodeId === 'a1' &&
          c.payload.toNodeId === 'alt:a1',
      ),
    ).toBe(true);
    const altNode = problem!.nodes.find((n) => n.nodeId === 'alt:a1');
    expect(altNode?.poiId).toBe('is.skogafoss');
    // depot → a1 uses stamped travel
    const depotIdx = problem!.travelMatrix.nodeIds.indexOf('depot');
    const a1Idx = problem!.travelMatrix.nodeIds.indexOf('a1');
    expect(problem!.travelMatrix.costsMin[depotIdx][a1Idx]).toBe(40);
  });
});
