import type { SegmentCoverage } from '../readiness/types/coverage-map.types';
import type { PlanningDaySplitDto } from '../trip-constraint-solver/types/planning-conflicts.types';
import {
  enrichDiversionsWithRouteGeometry,
  resolveTrunkSegmentIds,
} from './journey-map-route-geometry.util';

describe('journey-map-route-geometry.util', () => {
  const pois = [
    {
      id: 'poi-1',
      itemId: 'item-depart',
      day: 3,
      order: 1,
      name: 'Depart',
      type: 'NATURE',
      coordinates: { lat: 63.5, lng: -19.5 },
      coverageStatus: 'covered' as const,
      evidenceCount: 0,
    },
    {
      id: 'poi-2',
      itemId: 'item-hike',
      day: 3,
      order: 2,
      name: 'Hike',
      type: 'NATURE',
      coordinates: { lat: 63.6, lng: -19.4 },
      coverageStatus: 'covered' as const,
      evidenceCount: 0,
    },
  ];

  const segments: SegmentCoverage[] = [
    {
      id: 'seg-1',
      sequenceIndex: 0,
      fromPoiId: 'poi-1',
      toPoiId: 'poi-2',
      day: 3,
      distance: 10,
      duration: 12,
      routeType: 'driving',
      coverageStatus: 'covered',
      polyline: 'abc',
      geometrySource: 'straight_line',
      hazards: [],
    },
  ];

  const daySplit: PlanningDaySplitDto = {
    id: 'ds-1',
    splitPlanId: 'div-d3',
    dayIndex: 2,
    dayNumber: 3,
    title: 'Day 3 split',
    sharedBefore: [{ id: 'seg_item-depart', kind: 'shared', startTime: '10:00', title: 'Depart' }],
    fork: { startTime: '11:00', afterSegmentId: 'seg_item-depart' },
    branches: [
      {
        id: 'grp_a',
        groupId: 'grp_a',
        groupLabel: 'A',
        memberCount: 1,
        segments: [{ id: 'seg_item-hike', kind: 'branch', startTime: '11:00', title: 'Hike' }],
      },
      {
        id: 'grp_b',
        groupId: 'grp_b',
        groupLabel: 'B',
        memberCount: 1,
        segments: [{ id: 'seg_item-rest', kind: 'branch', startTime: '11:00', title: 'Rest' }],
      },
    ],
  };

  it('resolveTrunkSegmentIds maps fork item to coverage segment ids', () => {
    const result = resolveTrunkSegmentIds({ daySplit, segments, pois });
    expect(result.trunkSegmentIds).toEqual(['seg-1']);
    expect(result.forkAfterSegmentId).toBe('seg-1');
  });

  it('enrichDiversionsWithRouteGeometry provides merge polylineA/B from each branch to rejoin', async () => {
    const extendedPois = [
      ...pois,
      {
        id: 'poi-3',
        itemId: 'item-rest',
        day: 3,
        order: 3,
        name: 'Rest',
        type: 'NATURE',
        coordinates: { lat: 63.55, lng: -19.45 },
        coverageStatus: 'covered' as const,
        evidenceCount: 0,
      },
      {
        id: 'poi-4',
        itemId: 'item-dinner',
        day: 3,
        order: 4,
        name: 'Dinner',
        type: 'NATURE',
        coordinates: { lat: 63.58, lng: -19.42 },
        coverageStatus: 'covered' as const,
        evidenceCount: 0,
      },
    ];

    const splitWithRejoin: PlanningDaySplitDto = {
      ...daySplit,
      rejoin: { id: 'seg_item-dinner', kind: 'rejoin', startTime: '17:30', title: '汇合 · 维克' },
    };

    const routeGeometry = {
      resolveGeometry: jest
        .fn()
        .mockResolvedValueOnce({ polyline: 'fork-to-a', geometrySource: 'route_api' })
        .mockResolvedValueOnce({ polyline: 'fork-to-b', geometrySource: 'route_api' })
        .mockResolvedValueOnce({ polyline: 'a-to-merge', geometrySource: 'route_api' })
        .mockResolvedValueOnce({ polyline: 'b-to-merge', geometrySource: 'route_api' }),
    };

    const enriched = await enrichDiversionsWithRouteGeometry({
      diversions: [
        {
          id: 'div-d3',
          dayIndex: 2,
          title: 'Day 3 split',
          splitCoordinates: [-19.5, 63.5],
          groupA: { label: 'A', activityId: 'item-hike', color: '#7c3aed' },
          groupB: { label: 'B', activityId: 'item-rest', color: '#ea580c' },
        },
      ],
      daySplits: [splitWithRejoin],
      pois: extendedPois,
      segments,
      itineraryItems: [],
      routeGeometry: routeGeometry as any,
    });

    expect(enriched[0]?.groupA.polyline).toBe('fork-to-a');
    expect(enriched[0]?.groupB.polyline).toBe('fork-to-b');
    expect(enriched[0]?.merge?.polylineA).toBe('a-to-merge');
    expect(enriched[0]?.merge?.polylineB).toBe('b-to-merge');
    expect(enriched[0]?.merge?.polylineA).toBeDefined();
    expect(enriched[0]?.merge?.polylineB).toBeDefined();
  });
});
