import type { TripPlan } from '../plan-model';
import {
  applyGuardianRepairInstructions,
  isGuardianRepairInstruction,
} from './guardian-repair-applier.util';
import type { RepairInstruction } from './repair-action.types';

describe('guardian-repair-applier.util', () => {
  const plan: TripPlan = {
    version: '1',
    createdAt: '2026-01-01T00:00:00.000Z',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          { id: 's1', time: '09:00', endTime: '11:00', title: 'A', type: 'sightseeing' },
          { id: 's2', time: '14:00', title: 'B', type: 'sightseeing', priorityTag: 'optional' },
        ],
      },
    ],
  };

  const repair = (partial: Partial<RepairInstruction>): RepairInstruction => ({
    id: 'guardian_hint_1',
    action: 'INSERT_REST',
    targetSlotIds: ['s1'],
    narrative: 'test',
    priority: 1,
    confidence: 0.8,
    metadata: { source: 'suggested_adjustment' },
    ...partial,
  });

  it('identifies guardian repair instructions', () => {
    expect(isGuardianRepairInstruction(repair({}))).toBe(true);
    expect(isGuardianRepairInstruction(repair({ id: 'other', metadata: undefined }))).toBe(false);
  });

  it('applies INSERT_REST to target slot', () => {
    const result = applyGuardianRepairInstructions(plan, { candidatesByDate: {} } as any, [
      repair({ action: 'INSERT_REST' }),
    ]);
    expect(result.changedSlotIds).toEqual(['s1']);
    expect(result.plan.days[0].timeSlots[0].type).toBe('rest');
    expect(result.plan.days[0].timeSlots[0].title).toContain('休息');
  });

  it('removes optional slot on SKIP_OPTIONAL_POI', () => {
    const result = applyGuardianRepairInstructions(plan, { candidatesByDate: {} } as any, [
      repair({ action: 'SKIP_OPTIONAL_POI', targetSlotIds: ['s2'] }),
    ]);
    expect(result.changedSlotIds).toEqual(['s2']);
    expect(result.plan.days[0].timeSlots).toHaveLength(1);
  });

  it('shifts slot time on MOVE_SLOT_LATER', () => {
    const result = applyGuardianRepairInstructions(plan, { candidatesByDate: {} } as any, [
      repair({ action: 'MOVE_SLOT_LATER', suggestedDeltaMinutes: 60, targetSlotIds: ['s1'] }),
    ]);
    expect(result.plan.days[0].timeSlots[0].time).toBe('10:00');
    expect(result.plan.days[0].timeSlots[0].endTime).toBe('12:00');
  });
});
