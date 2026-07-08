import type { TripPlan } from '../../trips/decision/plan-model';
import { tripPlanToMaterializeOperations } from './trip-plan-to-materialize-operations.util';

function minimalGuidePlan(): TripPlan {
  return {
    version: 'guide-draft@v1',
    createdAt: new Date().toISOString(),
    tripId: 'trip_1',
    days: [
      {
        day: 1,
        date: '2026-08-01',
        timeSlots: [
          {
            id: 'slot_a',
            time: '10:00',
            endTime: '12:00',
            title: '蓝湖',
            type: 'sightseeing',
            poiId: '42',
            semanticTags: ['guide_faithful'],
          },
          {
            id: 'slot_b',
            time: '14:00',
            title: '午餐',
            type: 'food',
            semanticTags: ['guide_adjusted'],
          },
        ],
      },
      {
        day: 2,
        date: '2026-08-02',
        timeSlots: [
          {
            id: 'slot_c',
            time: '09:00',
            endTime: '11:00',
            title: '黄金圈',
            type: 'sightseeing',
          },
        ],
      },
    ],
  };
}

describe('tripPlanToMaterializeOperations', () => {
  it('maps each time slot to ADD_ITEM with stable ids', () => {
    const ops = tripPlanToMaterializeOperations({
      plan: minimalGuidePlan(),
      tripId: 'trip_1',
    });

    expect(ops).toHaveLength(3);
    expect(ops.every((op) => op.kind === 'ADD_ITEM')).toBe(true);
    expect(ops[0]).toMatchObject({
      operationId: 'op_add_trip_1_slot_a',
      parameters: {
        tripDayIndex: 0,
        itineraryItemId: 'guide_item_trip_1_slot_a',
        placeId: 42,
        title: '蓝湖',
        activityType: 'sightseeing',
        startTime: '10:00',
        endTime: '12:00',
        sourceTag: 'guide',
      },
    });
    expect(ops[1].parameters.sourceTag).toBe('adjusted');
    expect(ops[2].parameters.tripDayIndex).toBe(1);
  });

  it('returns empty array for plan with no slots', () => {
    const ops = tripPlanToMaterializeOperations({
      plan: { version: 'v1', createdAt: '', days: [] },
      tripId: 'trip_x',
    });
    expect(ops).toEqual([]);
  });
});
