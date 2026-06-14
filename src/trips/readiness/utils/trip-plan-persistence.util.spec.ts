import {
  buildTripPlanPersistenceOps,
  combineDateAndTime,
  findTripDayIdForPlanDay,
  mapPlanSlotTypeToItemType,
  resolveSlotTimes,
  summarizePersistenceResult,
} from './trip-plan-persistence.util';
import type { TripPlan } from '../../decision/plan-model';

describe('trip-plan-persistence.util', () => {
  const tripDays = [
    { id: 'day-1', date: new Date('2026-06-01T00:00:00.000Z') },
    { id: 'day-2', date: new Date('2026-06-02T00:00:00.000Z') },
  ];

  const existingItems = [
    { id: 'item-1', tripDayId: 'day-1', type: 'ACTIVITY', placeId: 10 },
    { id: 'item-2', tripDayId: 'day-1', type: 'ACTIVITY', placeId: 11 },
    { id: 'item-3', tripDayId: 'day-2', type: 'ACTIVITY', placeId: 12 },
  ];

  it('maps plan slot types to prisma item types', () => {
    expect(mapPlanSlotTypeToItemType('transport')).toBe('TRANSIT');
    expect(mapPlanSlotTypeToItemType('food')).toBe('MEAL_FLOATING');
    expect(mapPlanSlotTypeToItemType('sightseeing')).toBe('ACTIVITY');
  });

  it('finds trip day by iso date first', () => {
    expect(findTripDayIdForPlanDay({ day: 2, date: '2026-06-01', timeSlots: [] }, tripDays)).toBe(
      'day-1',
    );
  });

  it('builds update/delete operations when a slot is removed from a day', () => {
    const plan: TripPlan = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'item-1',
              time: '09:00',
              endTime: '11:00',
              title: 'A',
              type: 'sightseeing',
              poiId: '10',
            },
          ],
        },
      ],
    };

    const ops = buildTripPlanPersistenceOps({
      plan,
      tripDays,
      existingItems,
    });

    expect(ops.deletes).toEqual(['item-2']);
    expect(ops.updates).toHaveLength(1);
    expect(ops.updates[0].order).toBe(1);
    expect(ops.updates[0].startTime).toEqual(combineDateAndTime('2026-06-01', '09:00'));
  });

  it('creates new slots and skips locked deletions', () => {
    const plan: TripPlan = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'item-1',
              time: '09:00',
              title: 'A',
              type: 'sightseeing',
              poiId: '10',
            },
            {
              id: 'item-new',
              time: '13:00',
              title: 'B',
              type: 'sightseeing',
              poiId: '99',
            },
          ],
        },
      ],
    };

    const ops = buildTripPlanPersistenceOps({
      plan,
      tripDays,
      existingItems,
      lockedSlotIds: new Set(['item-2']),
    });

    expect(ops.deletes).not.toContain('item-2');
    expect(ops.skippedLockedItemIds).toContain('item-2');
    expect(ops.creates).toHaveLength(1);
    expect(ops.creates[0].id).toBe('item-new');
    expect(resolveSlotTimes(plan.days[0], plan.days[0].timeSlots[1]).endTime).toBeTruthy();
  });

  it('summarizes whether persistence changed anything', () => {
    const summary = summarizePersistenceResult({
      updates: [{ id: 'item-1' }],
      creates: [],
      deletes: [],
      skippedLockedItemIds: [],
    });
    expect(summary.applied).toBe(true);
    expect(summary.updatedItemIds).toEqual(['item-1']);
  });
});
