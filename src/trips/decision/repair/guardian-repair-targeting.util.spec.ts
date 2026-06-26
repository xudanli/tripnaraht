import type { TripPlan } from '../plan-model';
import {
  findPlanDay,
  parseDayIndexFromText,
  pickSlotIdsForPlanDay,
  resolveGuardianTargetSlotIds,
} from './guardian-repair-targeting.util';

describe('guardian-repair-targeting.util', () => {
  const plan: TripPlan = {
    version: '1',
    createdAt: '2026-01-01T00:00:00.000Z',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [{ id: 'd1s1', time: '09:00', title: 'A', type: 'sightseeing' }],
      },
      {
        day: 2,
        date: '2026-06-02',
        timeSlots: [
          { id: 'd2s1', time: '08:00', title: 'Drive', type: 'transport' },
          { id: 'd2s2', time: '14:00', endTime: '16:00', title: 'Hike', type: 'sightseeing' },
        ],
      },
    ],
  };

  it('parses day index from guardian concern text', () => {
    expect(parseDayIndexFromText('Day2 驾驶进入危险区')).toBe(2);
    expect(parseDayIndexFromText('第3天 TDFPM 疲劳指数 72')).toBe(3);
    expect(parseDayIndexFromText('无日期提示')).toBeUndefined();
  });

  it('targets slots on the specified plan day', () => {
    expect(pickSlotIdsForPlanDay(plan, 2, 'SPLIT_DRIVE')).toEqual(['d2s1']);
    expect(pickSlotIdsForPlanDay(plan, 2, 'INSERT_REST')).toEqual(['d2s2']);
    expect(findPlanDay(plan, 2)?.date).toBe('2026-06-02');
  });

  it('falls back to highest-fatigue day when text has no day', () => {
    const resolved = resolveGuardianTargetSlotIds({
      plan,
      action: 'INSERT_REST',
      fatiguePrediction: [
        { dayIndex: 1, fatigueScore: 40, riskLevel: 'LOW', recommendation: 'MONITOR' },
        { dayIndex: 2, fatigueScore: 78, riskLevel: 'HIGH', recommendation: 'REST_NOW' },
      ],
    });
    expect(resolved.dayIndex).toBe(2);
    expect(resolved.slotIds).toEqual(['d2s2']);
  });
});
