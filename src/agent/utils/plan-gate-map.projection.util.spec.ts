import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import { projectPlanGateMapGeoJson } from './plan-gate-map.projection.util';
import { projectPlanGateDraftDiff } from './plan-gate-diff.projection.util';
import {
  buildPreTripTasksFromPlanState,
  mergePreTripTasksSummary,
} from './plan-gate-pretrip-tasks.util';

function seg(
  day: number,
  theme: string,
  coords: Array<{ lat: number; lng: number }>,
  acc?: string,
): PlanState['itinerary']['segments'][number] {
  return {
    segmentId: `day_${day}_segment_1`,
    dayIndex: day - 1,
    distanceKm: coords.length > 1 ? 80 : 0,
    ascentM: 0,
    slopePct: 0,
    metadata: {
      day,
      theme,
      name: `第${day}天：${theme}`,
      attractions: coords.slice(0, -1).map((c, i) => ({
        nameCN: `景点${i + 1}`,
        coordinates: c,
      })),
      accommodation: acc
        ? { nameCN: acc, coordinates: coords[coords.length - 1] }
        : undefined,
    },
  };
}

describe('plan-gate-map.projection.util', () => {
  it('builds GeoJSON with baseline and draft routes', () => {
    const baseline: PlanState = {
      plan_id: 'a3',
      plan_version: 3,
      constraints: { time: { days: 2 }, budget: {}, fitness: {} },
      itinerary: {
        tripId: 't1',
        routeDirectionId: 'r1',
        segments: [
          seg(1, '抵达', [
            { lat: 64.13, lng: -21.9 },
            { lat: 64.25, lng: -21.7 },
          ], '旧酒店'),
          seg(2, '黄金圈', [
            { lat: 64.25, lng: -21.7 },
            { lat: 64.31, lng: -20.3 },
          ], '南岸'),
        ],
      },
      mobility: { transferSegments: [] },
      budget: {},
      pace: {},
      gate: { status: 'ALLOW', reasons: [], missingEvidence: [] },
      evidence_refs: [],
      decision_log_refs: [],
      status: 'DRAFT',
      metadata: {},
    };

    const draft: PlanState = {
      ...baseline,
      plan_id: 'a4',
      plan_version: 4,
      itinerary: {
        ...baseline.itinerary,
        segments: [
          baseline.itinerary.segments[0],
          seg(2, '黄金圈', [
            { lat: 64.25, lng: -21.7 },
            { lat: 64.35, lng: -20.1 },
          ], '升级酒店'),
        ],
      },
    };

    const diff = projectPlanGateDraftDiff({
      baselinePlanId: 'a3',
      baselinePlanState: baseline,
      draftPlanId: 'a4',
      draftPlanState: draft,
    });

    expect(diff.mapGeoJson).toBeDefined();
    expect(diff.mapGeoJson!.features.length).toBeGreaterThan(0);
    expect(diff.mapGeoJson!.features.some((f) => f.properties.role === 'draft_route')).toBe(true);
    expect(diff.mapGeoJson!.bounds).toBeDefined();
  });
});

describe('plan-gate-pretrip-tasks.util', () => {
  it('merges plan gate tasks with trip counts', () => {
    const planState: PlanState = {
      plan_id: 'p1',
      plan_version: 1,
      constraints: { time: { days: 1 }, budget: {}, fitness: {} },
      itinerary: { tripId: 't1', routeDirectionId: 'r1', segments: [] },
      mobility: { transferSegments: [] },
      budget: {},
      pace: {},
      gate: {
        status: 'NEED_CONFIRM',
        reasons: [],
        missingEvidence: ['weather'],
        requiredUserConfirmations: ['确认 Day 3 节奏'],
      },
      evidence_refs: [],
      decision_log_refs: [],
      status: 'DRAFT',
      metadata: {},
    };

    const summary = mergePreTripTasksSummary(buildPreTripTasksFromPlanState(planState), {
      uncheckedPackingItems: 2,
      openSuggestions: 1,
      uncheckedCapabilityPackItems: 0,
    });

    expect(summary.total).toBeGreaterThanOrEqual(3);
    expect(summary.tasks.some((t) => t.category === 'packing')).toBe(true);
  });
});
