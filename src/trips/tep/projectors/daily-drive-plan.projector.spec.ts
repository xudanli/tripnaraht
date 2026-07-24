import { projectDailyDrivePlans } from './daily-drive-plan.projector';
import type { ItineraryItemRow, TripDayRow } from './daily-drive-plan.projector';

describe('projectDailyDrivePlans', () => {
  const tripDays: TripDayRow[] = [
    { id: 'day_1', date: '2026-08-01T00:00:00.000Z' },
    { id: 'day_2', date: '2026-08-02T00:00:00.000Z' },
  ];

  it('projects drive legs, activities, accommodation, and buffers from ordered items', () => {
    const itemsByDayId = new Map<string, ItineraryItemRow[]>([
      [
        'day_1',
        [
          {
            id: 'item_a',
            tripDayId: 'day_1',
            type: 'ACTIVITY',
            order: 1,
            placeId: 101,
            placeNameEN: 'Seljalandsfoss',
            travelFromPreviousDuration: null,
          },
          {
            id: 'item_b',
            tripDayId: 'day_1',
            type: 'ACTIVITY',
            order: 2,
            placeId: 102,
            placeNameEN: 'Skogafoss',
            travelFromPreviousDuration: 45,
            travelMode: 'DRIVING',
            note: JSON.stringify({ routeSegmentId: 'segment:trip_1:drive_day1_leg1' }),
          },
          {
            id: 'item_rest',
            tripDayId: 'day_1',
            type: 'REST',
            order: 3,
            note: JSON.stringify({ bufferMinutes: 20, bufferKind: 'FLEX' }),
          },
          {
            id: 'item_hotel',
            tripDayId: 'day_1',
            type: 'REST',
            order: 4,
            placeCategory: 'HOTEL',
            placeNameEN: 'Vik Hotel',
            note: JSON.stringify({ latestArrival: '22:00' }),
          },
        ],
      ],
      [
        'day_2',
        [
          {
            id: 'item_c',
            tripDayId: 'day_2',
            type: 'MEAL_ANCHOR',
            order: 1,
            placeNameEN: 'Cafe',
            travelFromPreviousDuration: null,
          },
        ],
      ],
    ]);

    const plans = projectDailyDrivePlans({
      tripId: 'trip_1',
      planVersionId: 'pv_1',
      tripDays,
      itemsByDayId,
    });

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      date: '2026-08-01',
      dayIndex: 1,
      origin: { ref: 'anchor_101', label: 'Seljalandsfoss' },
      destination: { ref: 'anchor_item_hotel', label: 'Vik Hotel' },
    });

    expect(plans[0]!.legs).toEqual([
      {
        legId: 'drive_leg_1_1',
        fromRef: 'item_a',
        toRef: 'item_b',
        baseNavigationMinutes: 45,
        roadRefs: ['segment:trip_1:drive_day1_leg1'],
        importance: 'RECOMMENDED',
        flexibility: 'REMOVABLE',
      },
    ]);

    expect(plans[0]!.activities).toHaveLength(2);
    expect(plans[0]!.activities[0]).toMatchObject({
      ref: 'activity_item_a',
      importance: 'RECOMMENDED',
      flexibility: 'REMOVABLE',
    });

    expect(plans[0]!.accommodation).toEqual({
      ref: 'accommodation_item_hotel',
      latestArrival: '22:00',
    });

    expect(plans[0]!.buffers).toEqual([
      {
        ref: 'buffer_item_rest',
        kind: 'FLEX',
        minutes: 20,
      },
    ]);

    expect(plans[1]!.activities[0]).toMatchObject({
      ref: 'activity_item_c',
      importance: 'OPTIONAL',
      flexibility: 'REPLACEABLE',
    });
  });

  it('marks sole accommodation and reservation anchors as mandatory fixed', () => {
    const itemsByDayId = new Map<string, ItineraryItemRow[]>([
      [
        'day_1',
        [
          {
            id: 'item_reserved',
            tripDayId: 'day_1',
            type: 'ACTIVITY',
            order: 1,
            bookingStatus: 'CONFIRMED',
            startTime: '2026-08-01T14:00:00.000Z',
            placeNameEN: 'Blue Lagoon',
          },
          {
            id: 'item_only_hotel',
            tripDayId: 'day_1',
            type: 'REST',
            order: 2,
            costCategory: 'ACCOMMODATION',
            placeNameEN: 'Reykjavik Hotel',
          },
        ],
      ],
    ]);

    const [plan] = projectDailyDrivePlans({
      tripId: 'trip_1',
      planVersionId: 'pv_1',
      tripDays: [tripDays[0]!],
      itemsByDayId,
    });

    expect(plan!.activities[0]).toMatchObject({
      importance: 'MANDATORY',
      flexibility: 'FIXED',
      reservationRequired: true,
      fixedStartAt: '2026-08-01T14:00:00.000Z',
    });
    expect(plan!.accommodation?.ref).toBe('accommodation_item_only_hotel');
  });

  it('honors persisted tepImportance and tepFlexibility metadata in note JSON', () => {
    const itemsByDayId = new Map<string, ItineraryItemRow[]>([
      [
        'day_1',
        [
          {
            id: 'item_must',
            tripDayId: 'day_1',
            type: 'ACTIVITY',
            order: 1,
            note: JSON.stringify({
              tepImportance: 'MANDATORY',
              tepFlexibility: 'MOVABLE',
              weatherSensitive: true,
            }),
            placeNameEN: 'Must-see POI',
          },
        ],
      ],
    ]);

    const [plan] = projectDailyDrivePlans({
      tripId: 'trip_1',
      planVersionId: 'pv_1',
      tripDays: [tripDays[0]!],
      itemsByDayId,
    });

    expect(plan!.activities[0]).toMatchObject({
      importance: 'MANDATORY',
      flexibility: 'MOVABLE',
      weatherSensitive: true,
    });
  });
});
