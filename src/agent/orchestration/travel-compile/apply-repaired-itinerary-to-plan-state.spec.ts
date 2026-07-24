import type { PlanState } from '../../../skills/plan/shared/plan-state.types';
import { applyRepairedItineraryToPlanState } from './apply-repaired-itinerary-to-plan-state.util';

describe('applyRepairedItineraryToPlanState', () => {
  it('writes repaired POI names back to segment attractions', () => {
    const planState: PlanState = {
      plan_id: 'plan_1',
      plan_version: 1,
      constraints: { time: { days: 1, startDate: '2026-08-03' }, budget: {}, fitness: {} },
      itinerary: {
        tripId: 'trip_1',
        routeDirectionId: 'rd_1',
        segments: [
          {
            segmentId: 's0',
            dayIndex: 0,
            distanceKm: 0,
            ascentM: 0,
            slopePct: 0,
            metadata: {
              attractions: [{ name: 'Gullfoss', canonical_poi_id: 'is.gullfoss' }],
            },
          },
        ],
      },
      mobility: { transferSegments: [] },
      budget: {},
      pace: {},
      gate: { status: 'ALLOW', reasons: [], missingEvidence: [] },
      evidence_refs: [],
      decision_log_refs: [],
      status: 'PROPOSED',
      metadata: {},
    };

    const out = applyRepairedItineraryToPlanState({
      planState,
      repairedItinerary: {
        request_id: 'plan_1',
        days: [
          {
            date: '2026-08-03',
            items: [
              { id: 'p1', type: 'POI', location_ref: { name: 'Gullfoss' } },
              { id: 'p2', type: 'POI', location_ref: { name: 'Geysir' } },
            ],
          },
        ],
      },
    });

    expect(out.segmentsUpdated).toBe(1);
    expect(out.itemsApplied).toBe(2);
    const attractions = planState.itinerary.segments[0]?.metadata?.attractions as Array<
      Record<string, unknown>
    >;
    expect(attractions?.map((a) => a.name)).toEqual(['Gullfoss', 'Geysir']);
    expect(attractions?.[0]?.canonical_poi_id).toBe('is.gullfoss');
    expect(planState.metadata?.graph_projected_itinerary).toBeDefined();
  });
});
