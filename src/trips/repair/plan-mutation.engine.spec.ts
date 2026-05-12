import type { TripPlan } from '../decision/plan-model';
import { applyRepair, applySlotUpdates } from './plan-mutation.engine';
import type { SlotRepairPlan } from './slot-repair.types';

describe('applyRepair', () => {
  const basePlan: TripPlan = {
    version: '1',
    createdAt: 't',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 's1',
            time: '09:00',
            title: 'A',
            type: 'nature',
            poiId: 'p-old',
          },
        ],
      },
    ],
  };

  it('REPLACE_POI updates poiId', () => {
    const repairs: SlotRepairPlan[] = [
      {
        slotId: 's1',
        action: 'REPLACE_POI',
        payload: { newPoiId: 'p-new' },
        confidence: 1,
      },
    ];
    const next = applyRepair(basePlan, repairs);
    expect(next.days[0]!.timeSlots[0]!.poiId).toBe('p-new');
    expect(basePlan.days[0]!.timeSlots[0]!.poiId).toBe('p-old');
  });

  it('applySlotUpdates merges partial replan slots by id', () => {
    const next = applySlotUpdates(basePlan, [
      {
        ...basePlan.days[0]!.timeSlots[0]!,
        time: '10:00',
        reasons: ['partial_replan'],
      },
    ]);
    expect(next.days[0]!.timeSlots[0]!.time).toBe('10:00');
    expect(basePlan.days[0]!.timeSlots[0]!.time).toBe('09:00');
  });

  it('REMOVE drops slot', () => {
    const repairs: SlotRepairPlan[] = [
      { slotId: 's1', action: 'REMOVE', confidence: 0.3 },
    ];
    const next = applyRepair(basePlan, repairs);
    expect(next.days[0]!.timeSlots).toHaveLength(0);
  });
});
