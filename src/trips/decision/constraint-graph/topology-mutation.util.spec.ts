import type { RoutePlanDraft } from '../shared/world-model.types';
import {
  REPAIR_SPATIAL_POI_V2_ID,
  applyTopologyMutation,
  isTopologyMutationViolation,
  segmentReferencesClosedRoad,
} from './topology-mutation.util';

describe('topology-mutation.util (PR-3)', () => {
  const f208Plan: RoutePlanDraft = {
    tripId: 't-f208',
    routeDirectionId: 'is-ring-road',
    segments: [
      {
        segmentId: 'seg-ring-paved',
        dayIndex: 1,
        distanceKm: 90,
        ascentM: 80,
        slopePct: 4,
        graphRelations: { fromPlaceId: 'place:reykjavik', graphNodeId: 'seg:seg-ring-paved' },
      },
      {
        segmentId: 'seg-f208',
        dayIndex: 2,
        distanceKm: 48,
        ascentM: 120,
        slopePct: 8,
        graphRelations: {
          fromPlaceId: 'road:F208',
          graphNodeId: 'seg:seg-f208',
        },
        metadata: { roadId: 'F208' },
      },
    ],
  };

  const physical = {
    demEvidence: [],
    roadStates: [{ roadId: 'F208', status: 'CLOSED' as const }],
    hazardZones: [],
    ferryStates: [],
    countryCode: 'IS',
    month: 1,
  };

  it('detects WORLD_ROAD / ROAD_CLOSED violation codes', () => {
    expect(isTopologyMutationViolation(['WORLD_ROAD_CLOSED'])).toBe(true);
    expect(isTopologyMutationViolation(['ROAD_CLOSED'])).toBe(true);
    expect(isTopologyMutationViolation(['TIME_WINDOW_VIOLATION'])).toBe(false);
  });

  it('segmentReferencesClosedRoad matches F208 graph relations', () => {
    expect(segmentReferencesClosedRoad(f208Plan.segments[1], ['road:F208'])).toBe(true);
    expect(segmentReferencesClosedRoad(f208Plan.segments[0], ['road:F208'])).toBe(false);
  });

  it('applyTopologyMutation removes F208 segment and injects ring continuity bypass', () => {
    const result = applyTopologyMutation(f208Plan, {
      physical,
      month: 1,
      vehicleType: '2WD',
      maxSlopePct: 12,
    });

    expect(result?.id).toBe(REPAIR_SPATIAL_POI_V2_ID);
    expect(result?.strategy).toBe('RING_ROAD_CONTINUITY');
    expect(result?.replacedRoadIds).toContain('road:F208');
    expect(result?.subgraphStats.nodeCount).toBeGreaterThan(0);

    const ids = result!.plan.segments.map((s) => s.segmentId);
    expect(result!.plan.segments.some((s) => segmentReferencesClosedRoad(s, ['road:F208']))).toBe(false);
    expect(ids.some((id) => /topology-ring/i.test(id))).toBe(true);
    expect(result!.plan.segments.some((s) => s.graphRelations?.fromPlaceId === 'place:vik')).toBe(true);
  });

  it('returns undefined when no closed roads and plan has no F-road segments', () => {
    const ringOnly: RoutePlanDraft = {
      tripId: 't-ring',
      routeDirectionId: 'is-ring-road',
      segments: [f208Plan.segments[0]],
    };
    const result = applyTopologyMutation(ringOnly, {
      physical: { ...physical, roadStates: [] },
      month: 6,
    });
    expect(result).toBeUndefined();
  });
});
