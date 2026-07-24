import {
  assessBufferLinkage,
  assessDailyFatigueLoad,
  assessMealWindowGap,
  assessMealWindowVsArrival,
  assessStayLinkage,
  assessTransferDailyLoad,
  computeLunchFreeGapMinutes,
} from './plan-object-day-assessment.util';
import type { PlanObject } from '../contracts/plan-object.types';
import { projectDayPlanObjects, projectTripPlanObjects } from './itinerary-to-plan-object.projector';

function baseObject(overrides: Partial<PlanObject>): PlanObject {
  return {
    planObjectId: 'po_test',
    type: 'VISIT',
    dayId: 'day-1',
    dayNumber: 1,
    date: '2026-07-10',
    sequence: 1,
    status: 'PLANNED',
    source: 'itinerary_item',
    ...overrides,
  };
}

describe('itinerary-to-plan-object.projector', () => {
  it('CAS-030: maps itinerary types and injects lunch MEAL_WINDOW from policy', () => {
    const day = {
      id: 'day-1',
      date: new Date('2026-07-10T00:00:00.000Z'),
      dayNumber: 1,
      items: [
        {
          id: 'item-transfer',
          type: 'TRANSIT',
          tripDayId: 'day-1',
          startTime: new Date('2026-07-10T08:00:00.000Z'),
          endTime: new Date('2026-07-10T09:30:00.000Z'),
          note: null,
          placeId: null,
          costCategory: null,
          bookingStatus: null,
          travelFromPreviousDuration: 90,
          travelFromPreviousDistance: 120000,
          travelMode: 'DRIVING',
          Place: null,
        },
        {
          id: 'item-visit',
          type: 'ACTIVITY',
          tripDayId: 'day-1',
          startTime: new Date('2026-07-10T10:00:00.000Z'),
          endTime: new Date('2026-07-10T11:30:00.000Z'),
          note: null,
          placeId: 42,
          costCategory: null,
          bookingStatus: null,
          travelFromPreviousDuration: null,
          travelFromPreviousDistance: null,
          travelMode: null,
          Place: { nameCN: '瀑布', nameEN: 'Waterfall', category: 'ATTRACTION', address: null },
        },
      ],
    };

    const objects = projectDayPlanObjects(day, 'balanced');
    expect(objects.map((o) => o.type)).toEqual(['TRANSFER', 'VISIT', 'MEAL_WINDOW']);
    expect(objects[0].durationMinutes).toBe(90);
    expect(objects.find((o) => o.type === 'MEAL_WINDOW')?.source).toBe('lunch_strategy');
  });

  it('CAS-030b: applies mealWindowDayShifts from trip metadata to synthetic lunch window', () => {
    const day = {
      id: 'day-3',
      date: new Date('2026-07-12T00:00:00.000Z'),
      dayNumber: 3,
      items: [
        {
          id: 'item-visit',
          type: 'ACTIVITY',
          tripDayId: 'day-3',
          startTime: new Date('2026-07-12T10:00:00.000Z'),
          endTime: new Date('2026-07-12T11:30:00.000Z'),
          note: null,
          placeId: 1,
          costCategory: null,
          bookingStatus: null,
          travelFromPreviousDuration: null,
          travelFromPreviousDistance: null,
          travelMode: null,
          Place: { nameCN: '景区', nameEN: 'Site', category: 'ATTRACTION', address: null },
        },
      ],
    };

    const objects = projectDayPlanObjects(day, 'balanced', { 3: 30 });
    const meal = objects.find((o) => o.type === 'MEAL_WINDOW');
    expect(meal?.startWindow).not.toBe('12:00');
    expect(meal?.metadata?.mealWindowShiftMinutes).toBe(30);
  });

  it('CAS-031: full day chain Stay → Transfer → Visit → Meal → Activity', () => {
    const view = projectTripPlanObjects({
      tripId: 'trip-1',
      trip: { metadata: { lunch_strategy: 'balanced' } },
      days: [
        {
          id: 'day-2',
          date: new Date('2026-07-11T00:00:00.000Z'),
          dayNumber: 2,
          items: [
            {
              id: 'stay',
              type: 'REST',
              tripDayId: 'day-2',
              startTime: new Date('2026-07-11T07:00:00.000Z'),
              endTime: new Date('2026-07-11T08:00:00.000Z'),
              note: 'Hotel Vik',
              placeId: null,
              costCategory: 'ACCOMMODATION',
              bookingStatus: 'BOOKED',
              travelFromPreviousDuration: null,
              travelFromPreviousDistance: null,
              travelMode: null,
              Place: { nameCN: '维克酒店', nameEN: 'Vik Hotel', category: 'HOTEL', address: null },
            },
            {
              id: 'xfer',
              type: 'TRANSIT',
              tripDayId: 'day-2',
              startTime: new Date('2026-07-11T08:30:00.000Z'),
              endTime: new Date('2026-07-11T10:00:00.000Z'),
              note: null,
              placeId: null,
              costCategory: null,
              bookingStatus: null,
              travelFromPreviousDuration: 90,
              travelFromPreviousDistance: null,
              travelMode: 'DRIVING',
              Place: null,
            },
            {
              id: 'visit',
              type: 'ACTIVITY',
              tripDayId: 'day-2',
              startTime: new Date('2026-07-11T10:30:00.000Z'),
              endTime: new Date('2026-07-11T12:00:00.000Z'),
              note: null,
              placeId: 1,
              costCategory: null,
              bookingStatus: null,
              travelFromPreviousDuration: null,
              travelFromPreviousDistance: null,
              travelMode: null,
              Place: { nameCN: '黑沙滩', nameEN: 'Black Beach', category: 'ATTRACTION', address: null },
            },
            {
              id: 'activity',
              type: 'ACTIVITY',
              tripDayId: 'day-2',
              startTime: new Date('2026-07-11T14:00:00.000Z'),
              endTime: new Date('2026-07-11T16:00:00.000Z'),
              note: '冰川徒步',
              placeId: null,
              costCategory: null,
              bookingStatus: null,
              travelFromPreviousDuration: null,
              travelFromPreviousDistance: null,
              travelMode: null,
              Place: null,
            },
          ],
        },
      ],
    });

    const types = view.days[0].objects.map((o) => o.type);
    expect(types).toContain('STAY');
    expect(types).toContain('TRANSFER');
    expect(types).toContain('VISIT');
    expect(types).toContain('MEAL_WINDOW');
    expect(types).toContain('ACTIVITY');
    expect(view.summary.totalObjects).toBeGreaterThanOrEqual(5);
  });
});

describe('plan-object-day-assessment.util', () => {
  it('CAS-032: flags meal window vs late arrival', () => {
    const objects = [
      baseObject({
        planObjectId: 'po_visit',
        type: 'VISIT',
        endWindow: '12:45',
        locationLabel: '景区 A',
        sequence: 1,
      }),
      baseObject({
        planObjectId: 'po_meal',
        type: 'MEAL_WINDOW',
        startWindow: '12:00',
        endWindow: '13:30',
        sequence: 2,
      }),
    ];
    const issues = assessMealWindowVsArrival(objects);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('MEAL_WINDOW_VS_ARRIVAL');
  });

  it('CAS-033: flags heavy transfer daily load', () => {
    const objects = [
      baseObject({
        planObjectId: 'po_t1',
        type: 'TRANSFER',
        durationMinutes: 200,
        sequence: 1,
      }),
      baseObject({
        planObjectId: 'po_t2',
        type: 'TRANSFER',
        durationMinutes: 200,
        sequence: 2,
      }),
    ];
    const issues = assessTransferDailyLoad(objects, 1);
    expect(issues[0].kind).toBe('TRANSFER_DAILY_LOAD');
    expect(issues[0].severity).toBe('WARNING');
  });

  it('CAS-034: warns when late activity without stay', () => {
    const objects = [
      baseObject({
        planObjectId: 'po_late',
        type: 'VISIT',
        endWindow: '21:00',
        sequence: 1,
      }),
    ];
    const issues = assessStayLinkage(objects, 3);
    expect(issues.some((i) => i.kind === 'STAY_LINKAGE')).toBe(true);
  });

  it('CAS-035: flags insufficient lunch gap (replaces trip-conflicts lunch-window)', () => {
    const objects = [
      baseObject({
        planObjectId: 'po_visit_am',
        type: 'VISIT',
        startWindow: '09:00',
        endWindow: '12:30',
        sequence: 1,
      }),
      baseObject({
        planObjectId: 'po_visit_pm',
        type: 'VISIT',
        startWindow: '13:00',
        endWindow: '17:00',
        sequence: 2,
      }),
      baseObject({
        planObjectId: 'po_meal',
        type: 'MEAL_WINDOW',
        startWindow: '12:30',
        endWindow: '13:30',
        durationMinutes: 30,
        sequence: 3,
      }),
    ];
    expect(computeLunchFreeGapMinutes(objects)).toBeLessThan(45);
    const issues = assessMealWindowGap(objects, 1, 'balanced');
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('MEAL_WINDOW_GAP');
  });

  it('CAS-036: flags buffer linkage between adjacent objects', () => {
    const objects = [
      baseObject({
        planObjectId: 'po_a',
        type: 'VISIT',
        startWindow: '10:00',
        endWindow: '11:50',
        locationLabel: '瀑布',
        sequence: 1,
      }),
      baseObject({
        planObjectId: 'po_b',
        type: 'VISIT',
        startWindow: '12:00',
        endWindow: '13:00',
        locationLabel: '黑沙滩',
        sequence: 2,
      }),
    ];
    const issues = assessBufferLinkage(objects, 1);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('BUFFER_LINKAGE');
  });

  it('CAS-037: flags daily fatigue from plan object metadata', () => {
    const objects = [
      baseObject({
        planObjectId: 'po_hike',
        type: 'ACTIVITY',
        metadata: { fatigueScore: 45 },
        sequence: 1,
      }),
      baseObject({
        planObjectId: 'po_climb',
        type: 'VISIT',
        metadata: { fatigueScore: 50 },
        sequence: 2,
      }),
    ];
    const issues = assessDailyFatigueLoad(objects, 2);
    expect(issues[0].kind).toBe('DAILY_FATIGUE_LOAD');
  });
});
