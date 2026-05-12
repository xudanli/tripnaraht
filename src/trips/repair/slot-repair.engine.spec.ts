import type { SlotConstraintState } from '../constraints/constraint-fusion.engine';
import type { TripPlan } from '../decision/plan-model';
import { computeSlotRepair } from './slot-repair.engine';

describe('computeSlotRepair', () => {
  const plan: TripPlan = {
    version: '1',
    createdAt: 't',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 'slot-x',
            time: '09:00',
            title: 'A',
            type: 'nature',
          },
        ],
      },
    ],
  };

  it('NOOP when not blocked', () => {
    const slot: SlotConstraintState = {
      slotId: 'slot-x',
      isBlocked: false,
      severity: 'LOW',
      blockingDomains: [],
      riskScore: 0,
    };
    expect(computeSlotRepair(slot, plan).action).toBe('NOOP');
  });

  it('blocked slot yields SHIFT_TIME when no alternatives (MVP)', () => {
    const slot: SlotConstraintState = {
      slotId: 'slot-x',
      isBlocked: true,
      severity: 'HIGH',
      blockingDomains: ['ROAD'],
      riskScore: 1,
    };
    const r = computeSlotRepair(slot, plan);
    expect(r.action).toBe('SHIFT_TIME');
    expect(r.payload?.deltaMinutes).toBe(90);
  });
});
