import type { TripPlan } from '../../decision/plan-model';
import {
  buildTripPlanItineraryDiff,
  applyStructuralRepairToPlan,
  countTripPlanSlots,
  countTripPlanSlotsForDay,
  itineraryDiffToHighlights,
} from './trip-plan-repair-preview.util';

function makePlan(slots: Array<{ id: string; time: string; title: string; endTime?: string }>): TripPlan {
  return {
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: slots.map((s) => ({
          id: s.id,
          time: s.time as TripPlan['days'][0]['timeSlots'][0]['time'],
          endTime: s.endTime as TripPlan['days'][0]['timeSlots'][0]['endTime'],
          title: s.title,
          type: 'sightseeing' as const,
        })),
      },
    ],
  };
}

describe('trip-plan-repair-preview.util', () => {
  it('buildTripPlanItineraryDiff detects time change and removal', () => {
    const before = makePlan([
      { id: 'a', time: '09:00', endTime: '10:00', title: '瀑布' },
      { id: 'b', time: '11:00', title: '午餐' },
    ]);

    const after = makePlan([{ id: 'a', time: '11:00', endTime: '12:00', title: '瀑布' }]);

    const diff = buildTripPlanItineraryDiff(before, after);
    expect(diff.map((d) => d.changeType)).toEqual(
      expect.arrayContaining(['time_changed', 'removed']),
    );
    expect(itineraryDiffToHighlights(diff).some((h) => h.includes('09:00'))).toBe(true);
  });

  it('applyStructuralRepairToPlan moves item to target day', () => {
    const before: TripPlan = {
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            { id: 'item-a', time: '09:00', title: '蓝湖', type: 'sightseeing' },
            { id: 'item-b', time: '18:00', title: '塞济斯菲厄泽', type: 'sightseeing' },
          ],
        },
      ],
    };

    const after = applyStructuralRepairToPlan(before, {
      actionType: 'move_to_day',
      payload: {
        itemId: 'item-b',
        suggestedValue: { dayNumber: 2 },
      },
    });

    const diff = buildTripPlanItineraryDiff(before, after);
    expect(diff.some((d) => d.changeType === 'moved_day' && d.slotId === 'item-b')).toBe(true);
    expect(countTripPlanSlotsForDay(after, 1)).toBe(1);
    expect(countTripPlanSlotsForDay(after, 2)).toBe(1);
  });

  it('counts slots per day and total', () => {
    const p: TripPlan = {
      version: '1.0.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [{ id: '1', time: '09:00', title: 'A', type: 'sightseeing' }],
        },
        {
          day: 2,
          date: '2026-06-02',
          timeSlots: [
            { id: '2', time: '10:00', title: 'B', type: 'sightseeing' },
            { id: '3', time: '14:00', title: 'C', type: 'sightseeing' },
          ],
        },
      ],
    };
    expect(countTripPlanSlots(p)).toBe(3);
    expect(countTripPlanSlotsForDay(p, 2)).toBe(2);
  });
});
