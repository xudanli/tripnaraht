import { applyOperationalDayWindowFeasibility } from './apply-operational-day-window-feasibility';
import type { TripPlan } from '../plan-model';

describe('applyOperationalDayWindowFeasibility', () => {
  it('flags slots outside default 08:00–21:00', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-07-01',
          timeSlots: [
            { id: 'early', time: '06:00', endTime: '07:00', title: 'X', type: 'other' },
            { id: 'ok', time: '10:00', endTime: '12:00', title: 'Y', type: 'sightseeing' },
            { id: 'late', time: '20:00', endTime: '22:00', title: 'Z', type: 'food' },
          ],
        },
      ],
    };

    const out = applyOperationalDayWindowFeasibility(plan);
    expect(out.violationCount).toBe(2);
    expect(out.outOfWindowSlotIds.sort()).toEqual(['early', 'late'].sort());
    expect(
      plan.days[0].timeSlots.find(s => s.id === 'late')?.reasons?.some(r =>
        r.includes('operational_day_window_v1'),
      ),
    ).toBe(true);
  });

  it('respects custom dayStart and dayEnd', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-07-01',
          timeSlots: [
            { id: 't', time: '07:30', title: 'Early OK', type: 'other' },
          ],
        },
      ],
    };

    const out = applyOperationalDayWindowFeasibility(plan, {
      dayStart: '07:00',
      dayEnd: '23:00',
    });
    expect(out.violationCount).toBe(0);
    expect(out.dayStart).toBe('07:00');
    expect(out.dayEnd).toBe('23:00');
  });
});
