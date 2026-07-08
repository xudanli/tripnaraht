import { buildImpactScopeView } from './impact-scope-view.util';
import type { Rfc001DecisionCenterProblemView } from './decision-center-bridge.adapter';
import type { PlanItemImpactDetail } from './plan-item-impact-details.util';

function baseView(
  overrides: Partial<Rfc001DecisionCenterProblemView> = {},
): Rfc001DecisionCenterProblemView {
  return {
    schemaId: 'tripnara.rfc001_problem_view@v1',
    tripId: 'trip_iceland_1',
    problemId: 'problem_road_1',
    problemSummary: {
      title: '道路 / 可行性：3 个行程项受影响',
    } as Rfc001DecisionCenterProblemView['problemSummary'],
    rfc001Problem: {
      problemId: 'problem_road_1',
      tripId: 'trip_iceland_1',
      planVersionId: 'plan_1',
      type: 'FEASIBILITY_FAILURE',
      semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
      triggerEventId: 'evt_road_1',
      affectedEntityRefs: [
        { kind: 'ROUTE_SEGMENT', id: 'road:F208', label: 'F208' },
        { kind: 'PLAN_ITEM', id: 'item_drive' },
      ],
      affectedPlanItemIds: ['item_drive', 'item_beach', 'item_hotel', 'item_dinner'],
      worldStateSnapshotId: 'snap_1',
      detectedAt: '2026-06-30T00:00:00.000Z',
      urgency: 'HIGH',
      status: 'OPEN',
    },
    leadingPersona: 'ABU',
    requiresUserConfirmation: true,
    candidates: [],
    options: [],
    lineage: [],
    ...overrides,
  };
}

const f208Details: PlanItemImpactDetail[] = [
  {
    itemId: 'item_drive',
    dayIndex: 3,
    label: 'F208',
    arrangementKind: 'DRIVE',
    hasBooking: false,
  },
  {
    itemId: 'item_beach',
    dayIndex: 3,
    label: '红沙滩',
    arrangementKind: 'ACTIVITY',
    hasBooking: false,
    placeId: 101,
  },
  {
    itemId: 'item_hotel',
    dayIndex: 3,
    label: 'Black Beach Suites',
    arrangementKind: 'HOTEL',
    hasBooking: true,
    placeId: 102,
  },
  {
    itemId: 'item_dinner',
    dayIndex: 3,
    label: 'Fish & Chips Vík',
    arrangementKind: 'MEAL',
    hasBooking: true,
    placeId: 103,
  },
];

describe('impact-scope-view.util', () => {
  it('IMPACT-001: road close narrative uses template + POI labels from data', () => {
    const view = buildImpactScopeView(
      baseView(),
      f208Details,
      {
        triggerEvent: {
          eventId: 'evt_road_1',
          eventType: 'ROAD_STATUS_CHANGED',
          aggregateType: 'TRIP',
          aggregateId: 'trip_iceland_1',
          occurredAt: '2026-06-30T00:00:00.000Z',
          correlationId: 'corr_1',
          ontologyVersion: 'rfc001-0.1.0',
          payload: {
            roadId: 'F208',
            status: 'CLOSED',
            sourceProvider: 'road.is_api',
          },
        },
      },
      {
        directItemIds: ['item_drive'],
        routeLabel: 'F208',
      },
    );

    expect(view?.schemaId).toBe('tripnara.impact_scope@v1');
    expect(view?.trigger).toEqual({
      capability: 'ROAD_SEGMENT_UNAVAILABLE',
      subjectKind: 'ROAD',
      subjectId: 'F208',
      status: 'CLOSED',
    });
    expect(view?.narrative.templateKey).toBe('impact.road_close.affects_arrangements');
    expect(view?.narrative.params.subjectId).toBe('F208');
    expect(view?.narrative.params.status).toBe('CLOSED');
    expect(view?.narrative.params.dayIndexes).toEqual([3]);
    expect(view?.narrative.params.arrangementLabels).toEqual([
      'F208',
      '红沙滩',
      'Black Beach Suites',
      'Fish & Chips Vík',
    ]);
    expect(view?.chain[0].label).toBe('F208');
    expect(view?.arrangements.filter((a) => !a.isDirect).length).toBe(3);
    expect(view?.chain.some((n) => n.consequenceKind === 'CHECKIN_AND_RESERVATION_TIMING')).toBe(
      true,
    );
  });

  it('IMPACT-002: excessive load uses AT_RISK + load consequence kind', () => {
    const view = buildImpactScopeView(
      baseView({
        rfc001Problem: {
          ...baseView().rfc001Problem,
          type: 'EXCESSIVE_LOAD',
          semanticCapability: 'EXCESSIVE_DAILY_LOAD',
          triggerEventId: 'evt_load_day_5',
          affectedEntityRefs: [{ kind: 'PLAN_ITEM', id: 'item_1', label: 'day5' }],
          affectedPlanItemIds: ['item_1', 'item_2'],
        },
      }),
      [
        {
          itemId: 'item_1',
          dayIndex: 6,
          label: 'Langjökull',
          arrangementKind: 'DRIVE',
          hasBooking: false,
        },
        {
          itemId: 'item_2',
          dayIndex: 6,
          label: 'Glacier hike',
          arrangementKind: 'ACTIVITY',
          hasBooking: false,
        },
      ],
    );

    expect(view?.trigger.capability).toBe('EXCESSIVE_DAILY_LOAD');
    expect(view?.trigger.subjectKind).toBe('DAY_LOAD');
    expect(view?.narrative.templateKey).toBe('impact.daily_load.affects_arrangements');
    expect(view?.narrative.params.overloadedDayIndex).toBe(6);
    expect(view?.narrative.params.primaryDayIndex).toBe(6);
    expect(view?.narrative.params.dayIndexes).toEqual([6]);
    expect(view?.trigger.dayIndex).toBe(6);
    expect(view?.arrangements.every((a) => a.impactType === 'AT_RISK')).toBe(true);
    expect(view?.chain.some((n) => n.consequenceKind === 'DAILY_DRIVING_LOAD')).toBe(true);
  });

  it('IMPACT-003: weather prohibited uses outdoor template', () => {
    const view = buildImpactScopeView(
      baseView({
        rfc001Problem: {
          ...baseView().rfc001Problem,
          semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
          type: 'FEASIBILITY_FAILURE',
          affectedPlanItemIds: ['item_hike'],
        },
      }),
      [
        {
          itemId: 'item_hike',
          dayIndex: 2,
          label: 'Glacier hike',
          arrangementKind: 'ACTIVITY',
          hasBooking: false,
        },
      ],
    );

    expect(view?.trigger.subjectKind).toBe('WEATHER');
    expect(view?.narrative.templateKey).toBe('impact.weather.affects_outdoor');
    expect(view?.narrative.params.arrangementLabels).toEqual(['Glacier hike']);
  });
});
