import type { PlanningDaySplitDto } from '../trip-constraint-solver/types/planning-conflicts.types';
import {
  buildDataFeeds,
  buildDaySummaries,
  buildDiversionsFromDaySplits,
  buildJourneyMapMemberGroups,
  buildJourneyMapMembers,
  buildJourneyMapStats,
  buildMemberInitials,
  buildSplitParticipantMap,
  enrichItineraryItemsWithParticipants,
  resolveTravelerSlots,
} from './journey-map-enrichment.util';

describe('journey-map-enrichment.util', () => {
  it('buildMemberInitials returns 1-2 chars', () => {
    expect(buildMemberInitials('张三')).toBe('张三');
    expect(buildMemberInitials('Alice Bob')).toBe('AB');
  });

  it('resolveTravelerSlots reads travelers from pacingConfig', () => {
    const slots = resolveTravelerSlots({
      pacingConfig: {
        travelers: [
          { type: 'ADULT' },
          { type: 'ELDERLY' },
          { type: 'CHILD' },
        ],
      },
    });
    expect(slots).toEqual(['ADULT', 'ELDERLY', 'CHILD']);
  });

  it('buildJourneyMapMembers assigns groupId from traveler slots', () => {
    const members = buildJourneyMapMembers({
      tripId: 'trip-abc',
      knownMembers: [
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
        { id: 'u3', name: 'Coco' },
      ],
      travelerSlots: ['ADULT', 'ELDERLY', 'CHILD'],
    });

    expect(members).toHaveLength(3);
    expect(members[0]?.groupId).toBe('young');
    expect(members[1]?.groupId).toBe('elderly');
    expect(members[2]?.groupId).toBe('children');
    expect(members[0]?.initials).toBe('Al');
  });

  it('buildJourneyMapMemberGroups counts members per group', () => {
    const members = buildJourneyMapMembers({
      tripId: 'trip-abc',
      knownMembers: [{ id: 'u1', name: 'Alice' }],
      travelerSlots: ['ADULT', 'ELDERLY'],
    });
    const groups = buildJourneyMapMemberGroups(members);
    expect(groups).toEqual([
      { id: 'young', label: '年轻人组', count: 1 },
      { id: 'elderly', label: '长者组', count: 1 },
      { id: 'children', label: '儿童组', count: 0 },
    ]);
  });

  it('buildDaySummaries covers every trip day with fallback labels', () => {
    const summaries = buildDaySummaries({
      tripDays: [
        { id: 'day-1', date: '2026-06-20', theme: null },
        { id: 'day-2', date: '2026-06-21', theme: '南岸' },
        { id: 'day-3', date: '2026-06-22', theme: null },
      ],
      coverage: {
        pois: [
          {
            id: 'p1',
            day: 1,
            order: 1,
            name: '雷克雅未克',
            type: 'city',
            coordinates: { lat: 64.1, lng: -21.9 },
            coverageStatus: 'covered',
            evidenceCount: 0,
          },
          {
            id: 'p2',
            day: 1,
            order: 2,
            name: '维克',
            type: 'city',
            coordinates: { lat: 63.4, lng: -19.0 },
            coverageStatus: 'covered',
            evidenceCount: 0,
          },
          {
            id: 'p3',
            day: 2,
            order: 1,
            name: '维克',
            type: 'city',
            coordinates: { lat: 63.4, lng: -19.0 },
            coverageStatus: 'covered',
            evidenceCount: 0,
          },
          {
            id: 'p4',
            day: 2,
            order: 2,
            name: '斯卡夫塔山',
            type: 'attraction',
            coordinates: { lat: 63.9, lng: -16.9 },
            coverageStatus: 'covered',
            evidenceCount: 0,
          },
        ],
        segments: [],
      },
      itineraryItems: [],
    });

    expect(summaries).toEqual([
      { day: 1, routeLabel: '雷克雅未克 → 维克' },
      { day: 2, routeLabel: '维克 → 斯卡夫塔山' },
      { day: 3, routeLabel: '第 3 天' },
    ]);
  });

  it('buildDaySummaries prefers theme fallback when no POI coverage', () => {
    const summaries = buildDaySummaries({
      tripDays: [{ id: 'day-2', date: '2026-06-21', theme: '黄金圈' }],
      coverage: { pois: [], segments: [] },
      itineraryItems: [],
    });
    expect(summaries).toEqual([{ day: 1, routeLabel: '黄金圈' }]);
  });

  it('buildDataFeeds returns four feeds with inventory fallback', () => {
    const feeds = buildDataFeeds({
      calculatedAt: '2026-06-29T12:00:00.000Z',
      dataFreshness: {
        weather: '2026-06-29T10:00:00.000Z',
        roadClosure: '2026-06-29T09:00:00.000Z',
      },
    });
    expect(feeds).toHaveLength(4);
    expect(feeds.map((f) => f.id)).toEqual(['weather', 'road', 'hours', 'inventory']);
    expect(feeds[0]?.status).toBe('fresh');
    expect(feeds[2]?.status).toBe('stale');
    expect(feeds[3]?.status).toBe('fresh');
  });

  it('buildDaySummaries uses first and last POI per day', () => {
    const summaries = buildDaySummaries({
      tripDays: [
        { id: 'day-1', date: '2026-06-20', theme: null },
        { id: 'day-2', date: '2026-06-21', theme: null },
      ],
      coverage: {
        pois: [
          {
            id: 'p1',
            day: 1,
            order: 1,
            name: '雷克雅未克',
            type: 'city',
            coordinates: { lat: 64.1, lng: -21.9 },
            coverageStatus: 'covered',
            evidenceCount: 0,
          },
          {
            id: 'p2',
            day: 1,
            order: 2,
            name: '维克',
            type: 'city',
            coordinates: { lat: 63.4, lng: -19.0 },
            coverageStatus: 'covered',
            evidenceCount: 0,
          },
          {
            id: 'p3',
            day: 2,
            order: 1,
            name: '维克',
            type: 'city',
            coordinates: { lat: 63.4, lng: -19.0 },
            coverageStatus: 'covered',
            evidenceCount: 0,
          },
          {
            id: 'p4',
            day: 2,
            order: 2,
            name: '斯卡夫塔山',
            type: 'attraction',
            coordinates: { lat: 63.9, lng: -16.9 },
            coverageStatus: 'covered',
            evidenceCount: 0,
          },
        ],
        segments: [],
      },
      itineraryItems: [],
    });

    expect(summaries).toEqual([
      { day: 1, routeLabel: '雷克雅未克 → 维克' },
      { day: 2, routeLabel: '维克 → 斯卡夫塔山' },
    ]);
  });

  it('buildDiversionsFromDaySplits maps branches to diversion groups', () => {
    const daySplits: PlanningDaySplitDto[] = [
      {
        id: 'ds-1',
        splitPlanId: 'div-d3',
        dayIndex: 2,
        dayNumber: 3,
        title: 'Day 3 体力分流',
        sharedBefore: [{ id: 'seg_item-depart', kind: 'shared', startTime: '10:00', title: '出发' }],
        fork: { startTime: '11:00', afterSegmentId: 'seg_item-depart' },
        branches: [
          {
            id: 'grp_a',
            groupId: 'grp_a',
            groupLabel: '冰川徒步',
            memberCount: 2,
            variant: 'blue',
            members: [
              { id: 'u1', displayName: 'Alice' },
              { id: 'u2', displayName: 'Bob' },
            ],
            segments: [
              {
                id: 'seg_item-hike',
                kind: 'branch',
                startTime: '11:00',
                title: '冰川徒步',
                placeName: 'Sólheimajökull',
              },
            ],
          },
          {
            id: 'grp_b',
            groupId: 'grp_b',
            groupLabel: '咖啡馆休息',
            memberCount: 1,
            variant: 'orange',
            members: [{ id: 'u3', displayName: 'Carol' }],
            segments: [
              {
                id: 'seg_item-rest',
                kind: 'branch',
                startTime: '11:00',
                title: '咖啡馆休息',
              },
            ],
          },
        ],
      },
    ];

    const diversions = buildDiversionsFromDaySplits({
      daySplits,
      pois: [
        {
          id: 'poi-depart',
          itemId: 'item-depart',
          day: 3,
          order: 1,
          name: 'Skógafoss',
          type: 'NATURE',
          coordinates: { lat: 63.5, lng: -19.5 },
          coverageStatus: 'covered',
          evidenceCount: 0,
        },
      ],
      itineraryItems: [],
    });

    expect(diversions).toHaveLength(1);
    expect(diversions[0]?.id).toBe('div-d3');
    expect(diversions[0]?.groupA.activityId).toBe('item-hike');
    expect(diversions[0]?.groupB.activityId).toBe('item-rest');
    expect(diversions[0]?.groupA.participantIds).toEqual(['u1', 'u2']);
    expect(diversions[0]?.splitCoordinates).toEqual([-19.5, 63.5]);
  });

  it('enriches itinerary items with split participantIds', () => {
    const daySplits: PlanningDaySplitDto[] = [
      {
        id: 'ds-1',
        splitPlanId: 'div-d3',
        dayIndex: 2,
        dayNumber: 3,
        title: 'Day 3 体力分流',
        sharedBefore: [],
        branches: [
          {
            id: 'grp_a',
            groupId: 'grp_a',
            groupLabel: 'A',
            memberCount: 1,
            members: [{ id: 'u1', displayName: 'Alice' }],
            segments: [{ id: 'seg_item-hike', kind: 'branch', startTime: '11:00', title: '徒步' }],
          },
          {
            id: 'grp_b',
            groupId: 'grp_b',
            groupLabel: 'B',
            memberCount: 1,
            members: [{ id: 'u2', displayName: 'Bob' }],
            segments: [{ id: 'seg_item-rest', kind: 'branch', startTime: '11:00', title: '休息' }],
          },
        ],
      },
    ];

    const participantMap = buildSplitParticipantMap(daySplits);
    const enriched = enrichItineraryItemsWithParticipants(
      [
        { id: 'item-hike', type: 'ACTIVITY' },
        { id: 'item-rest', type: 'REST' },
      ],
      participantMap,
    );

    expect(enriched[0]).toMatchObject({ id: 'item-hike', participantIds: ['u1'] });
    expect(enriched[1]).toMatchObject({ id: 'item-rest', participantIds: ['u2'] });
  });

  it('buildJourneyMapStats aggregates days, distance, activities, diversions', () => {
    const stats = buildJourneyMapStats({
      dayCount: 6,
      coverage: {
        segments: [
          { distance: 120 } as any,
          { distance: 998 } as any,
        ],
      },
      itineraryItems: [
        { type: 'ACTIVITY' },
        { type: 'TRANSIT' },
        { type: 'MEAL_ANCHOR' },
      ],
      diversions: [{ id: 'd1' } as any],
    });

    expect(stats).toEqual({
      totalDays: 6,
      totalDistanceKm: 1118,
      activityCount: 2,
      diversionCount: 1,
    });
  });
});
