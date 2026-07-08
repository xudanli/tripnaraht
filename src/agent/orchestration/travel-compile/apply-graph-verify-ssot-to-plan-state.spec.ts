import type { PlanState } from '../../../skills/plan/shared/plan-state.types';
import type { Itinerary } from '../../interfaces/trip-plan.interface';
import { CANONICAL_TRAVEL_GRAPH_SCHEMA_ID } from '../../../travel-compiler/contracts/canonical-travel-graph.types';
import {
  applyGraphVerifySsotToPlanState,
  inferWorkbenchRepairAffectedDayIndices,
} from './apply-graph-verify-ssot-to-plan-state.util';

describe('applyGraphVerifySsotToPlanState', () => {
  it('registers graph projection as verify SSOT and preserves raw segments', () => {
    const segments = [
      {
        segmentId: 's0',
        dayIndex: 0,
        distanceKm: 0,
        ascentM: 0,
        slopePct: 0,
        metadata: { attractions: [{ name: 'Gullfoss' }] },
      },
    ];

    const projected: Itinerary = {
      request_id: 'plan_1',
      days: [
        {
          date: '2026-08-01',
          items: [
            {
              id: 'p1',
              type: 'POI',
              location_ref: { name: 'Gullfoss' },
              metadata: { canonical_poi_id: 'is.gullfoss' },
            },
          ],
        },
      ],
    };

    const planState: PlanState = {
      plan_id: 'plan_1',
      plan_version: 1,
      constraints: { time: { days: 1 }, budget: {}, fitness: {} },
      itinerary: { tripId: 'trip_1', routeDirectionId: 'rd_1', segments },
      mobility: { transferSegments: [] },
      budget: {},
      pace: {},
      gate: { status: 'NEED_CONFIRM', reasons: [], missingEvidence: [] },
      evidence_refs: [],
      decision_log_refs: [],
      status: 'PROPOSED',
      metadata: {
        canonical_travel_graph: {
          schemaId: CANONICAL_TRAVEL_GRAPH_SCHEMA_ID,
          graphId: 'g1',
          compileId: 'c1',
          destination: { countryCode: 'IS' },
          createdAt: new Date().toISOString(),
          days: [],
          nodes: [],
          edges: [],
          dependencies: [],
          constraints: [],
          bookings: [],
          evidenceCatalog: [],
          stats: {
            nodeCount: 0,
            edgeCount: 0,
            poiResolved: 1,
            poiUnresolved: 0,
            routeTemplatesResolved: 0,
            routeTemplatesTotal: 0,
            routeSegmentsResolved: 0,
            routeSegmentsTotal: 0,
            bookingRequired: 0,
            dependencySatisfied: 0,
            dependencyTotal: 0,
          },
        },
        graph_projected_itinerary: projected,
      },
    };

    const result = applyGraphVerifySsotToPlanState(planState);

    expect(result.applied).toBe(true);
    expect(result.projectedItemCount).toBe(1);
    expect(planState.metadata?.verify_itinerary_source).toBe('canonical_travel_graph@v0');
    expect(planState.metadata?.verify_ssot_applied).toBe(true);
    expect(planState.metadata?.workbench_raw_segments).toEqual(segments);
    expect(planState.itinerary?.segments).toEqual(segments);
    expect(
      (planState.metadata?.verify_shadow as Record<string, unknown>)?.ctre_graph_projection,
    ).toMatchObject({ graphId: 'g1', compileId: 'c1', itemCount: 1 });
  });
});

describe('inferWorkbenchRepairAffectedDayIndices', () => {
  const baseSegment = {
    distanceKm: 0,
    ascentM: 0,
    slopePct: 0,
    metadata: { attractions: [{ name: 'A' }] },
  };

  it('detects changed day indices', () => {
    const before = [{ segmentId: 's0', dayIndex: 0, ...baseSegment }];
    const after = [
      {
        segmentId: 's0',
        dayIndex: 0,
        ...baseSegment,
        metadata: { attractions: [{ name: 'B' }] },
      },
      { segmentId: 's1', dayIndex: 1, ...baseSegment },
    ];

    expect(inferWorkbenchRepairAffectedDayIndices({ segmentsBefore: before, segmentsAfter: after })).toEqual([
      0, 1,
    ]);
  });
});
