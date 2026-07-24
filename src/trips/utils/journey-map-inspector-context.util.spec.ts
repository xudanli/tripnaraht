import type { JourneyMapDiversionDto } from '../dto/journey-map.dto';
import type { CoverageMapData } from '../readiness/types/coverage-map.types';
import type { PlanningDaySplitDto } from '../trip-constraint-solver/types/planning-conflicts.types';
import {
  buildJourneyMapInspectorActivityContext,
  buildJourneyMapInspectorActivityContexts,
  selectInspectorActivityIds,
} from './journey-map-inspector-context.util';

describe('journey-map-inspector-context.util', () => {
  const members = [
    { id: 'u1', name: 'Alice', initials: 'Al', groupId: 'young' as const },
    { id: 'u2', name: 'Bob', initials: 'Bo', groupId: 'elderly' as const },
  ];

  const daySplits: PlanningDaySplitDto[] = [
    {
      id: 'ds-1',
      splitPlanId: 'div-d3',
      dayIndex: 2,
      dayNumber: 3,
      title: 'Day 3 体力分流',
      sharedBefore: [],
      fork: { startTime: '10:00', afterSegmentId: 'seg_item-depart' },
      branches: [
        {
          id: 'grp_a',
          groupId: 'grp_a',
          groupLabel: 'A组 · 冰川徒步',
          memberCount: 2,
          variant: 'blue',
          members: [{ id: 'u1', displayName: 'Alice' }],
          segments: [
            {
              id: 'seg_item-hike',
              kind: 'branch',
              startTime: '10:00',
              endTime: '13:30',
              title: '冰川徒步',
              placeName: 'Sólheimajökull',
              intensity: 'high',
              riskLevel: 'medium',
              costPerPerson: '$130',
            },
          ],
        },
        {
          id: 'grp_b',
          groupId: 'grp_b',
          groupLabel: 'B组 · 咖啡馆休息',
          memberCount: 1,
          variant: 'orange',
          members: [{ id: 'u2', displayName: 'Bob' }],
          segments: [
            {
              id: 'seg_item-rest',
              kind: 'branch',
              startTime: '10:00',
              endTime: '13:00',
              title: '咖啡馆休息',
              intensity: 'low',
            },
          ],
        },
      ],
      rejoin: { id: 'seg_rejoin', kind: 'rejoin', startTime: '13:30', title: '汇合' },
      stats: { meetupTime: '13:30' },
    },
  ];

  const diversions: JourneyMapDiversionDto[] = [
    {
      id: 'div-d3',
      dayIndex: 2,
      title: 'Day 3 体力分流',
      groupA: { label: 'A组', activityId: 'item-hike', color: '#8b5cf6' },
      groupB: { label: 'B组', activityId: 'item-rest', color: '#f97316' },
    },
  ];

  const coverage: CoverageMapData = {
    tripId: 'trip-1',
    bounds: {} as any,
    center: { lat: 64, lng: -21 },
    zoom: 6,
    pois: [
      {
        id: 'poi-hike',
        itemId: 'item-hike',
        day: 3,
        order: 1,
        name: '冰川徒步',
        type: 'attraction',
        coordinates: { lat: 63.5, lng: -19.5 },
        coverageStatus: 'partial',
        evidenceCount: 1,
        evidenceTypes: ['weather'],
      },
    ],
    segments: [
      {
        id: 'seg-1',
        fromPoiId: 'poi-depart',
        toPoiId: 'poi-hike',
        day: 3,
        distance: 45,
        duration: 100,
        routeType: 'driving',
        coverageStatus: 'covered',
        polyline: 'abc',
        geometrySource: 'route_api',
        hazards: [],
      },
    ],
    gaps: [],
    summary: {} as any,
    calculatedAt: '2026-06-29T12:00:00.000Z',
    dataFreshness: {
      weather: '2026-06-29T10:00:00.000Z',
      roadClosure: '2026-06-29T09:00:00.000Z',
    },
  };

  const itineraryItems = [
    {
      id: 'item-hike',
      type: 'ACTIVITY',
      tripDayId: 'day-3',
      startTime: '2026-06-22T10:00:00.000Z',
      endTime: '2026-06-22T13:30:00.000Z',
      travelFromPreviousDuration: 100,
      participantIds: ['u1'],
      Place: {
        nameCN: '冰川徒步',
        category: 'nature',
        metadata: { canonicalType: 'GLACIER', summary: '沿冰川边缘安全徒步' },
      },
    },
    {
      id: 'item-rest',
      type: 'REST',
      tripDayId: 'day-3',
      participantIds: ['u2'],
      Place: { nameCN: '咖啡馆', category: 'restaurant' },
    },
  ];

  const baseInput = {
    itineraryItems,
    members,
    coverage,
    diversions,
    daySplits,
    decisionChecker: {
      evidence: { items: [], summary: { high: 0, medium: 0, low: 0 } },
      impact: {
        summary: { affectedDays: { value: '+1 天' }, budgetImpact: { value: '$80~$160' } },
        constraints: [],
        cascade: [],
      },
      splitPlan: {
        id: 'div-d3',
        logistics: {
          meetupPoint: '瓦特纳冰川停车场',
          meetupTime: '13:30',
          emergencyContact: '+354 112',
          transport: '超级吉普',
        },
        groups: [],
      },
    } as any,
    scoreRisks: [
      { id: 'r1', type: 'weather', severity: 'high', message: '天气变化', mitigation: ['查看预报'] },
    ],
    scoreFindings: [],
    ownerId: 'u1',
  };

  it('selectInspectorActivityIds includes diversion branch activities', () => {
    const ids = selectInspectorActivityIds(baseInput);
    expect(ids).toEqual(expect.arrayContaining(['item-hike', 'item-rest']));
  });

  it('buildJourneyMapInspectorActivityContexts enriches hike activity tabs', () => {
    const contexts = buildJourneyMapInspectorActivityContexts(baseInput);
    expect(contexts.length).toBeGreaterThanOrEqual(2);

    const hike = contexts.find((ctx) => ctx.activityId === 'item-hike');
    expect(hike).toBeDefined();
    expect(hike?.activityDetail?.activityTypeLabel).toContain('冰川徒步');
    expect(hike?.activityDetail?.intensityScore).toBe(4);
    expect(hike?.memberRows).toHaveLength(2);
    expect(hike?.memberRows?.[0]).toMatchObject({ memberId: 'u1', participating: true, roleLabel: '发起人' });
    expect(hike?.fitAssessment?.suitabilityPercent).toBeGreaterThan(0);
    expect(hike?.diversionDetail?.meetingPoint).toBe('瓦特纳冰川停车场');
    expect(hike?.diversionDetail?.groupA?.estimatedCost).toBe('$130');
    expect(hike?.evidenceSources?.length).toBeGreaterThanOrEqual(4);
    expect(hike?.evidenceConclusion?.verdict).toBe('caution');
    expect(hike?.riskView?.levelLabel).toBeTruthy();
    expect(hike?.routeEvidence?.durationMinutes).toBe(100);
  });

  it('buildJourneyMapInspectorActivityContext builds any valid activity id', () => {
    const rest = buildJourneyMapInspectorActivityContext('item-rest', baseInput);
    expect(rest?.activityId).toBe('item-rest');
    expect(rest?.activityDetail?.activityTypeLabel).toContain('咖啡馆');
  });
});
