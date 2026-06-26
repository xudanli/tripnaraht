import type { TripPlan } from '../plan-model';
import {
  applyGuardianRepairHintsToState,
  buildGuardianRepairHints,
  inferGuardianRepairAction,
  mapGuardianHintsToRepairInstructions,
} from './guardian-repair-hints.util';

describe('guardian-repair-hints.util', () => {
  const plan: TripPlan = {
    version: '1',
    createdAt: '2026-01-01T00:00:00.000Z',
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [{ id: 's1', time: '09:00', title: 'A', type: 'sightseeing' }],
      },
      {
        day: 2,
        date: '2026-06-02',
        timeSlots: [{ id: 's2', time: '09:00', title: 'B', type: 'sightseeing' }],
      },
    ],
  };

  it('infers repair actions from guardian text', () => {
    expect(inferGuardianRepairAction('第3天后插入休息日')).toBe('INSERT_REST');
    expect(inferGuardianRepairAction('缩短活动时间')).toBe('SHORTEN_ACTIVITY');
    expect(inferGuardianRepairAction('random note')).toBeUndefined();
  });

  it('maps hints to repair instructions and state signals', () => {
    const hints = buildGuardianRepairHints({
      decision: 'CONDITIONAL_APPROVE',
      consensusLevel: 0.62,
      conditions: ['确认 F-road 许可'],
      suggestedAdjustments: ['第3天后插入休息日'],
      sourcePhase: 'pre_repair',
      negotiatedAt: '2026-06-14T00:00:00.000Z',
    });

    const repairs = mapGuardianHintsToRepairInstructions(plan, hints);
    expect(repairs).toHaveLength(1);
    expect(repairs[0].action).toBe('INSERT_REST');

    const state = {
      context: { destination: 'IS', startDate: '2026-06-01', durationDays: 2, preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' } },
      candidatesByDate: {},
      signals: { lastUpdatedAt: '2026-06-14T00:00:00.000Z' },
    } as any;

    applyGuardianRepairHintsToState(state, plan, hints);
    expect(state.signals.guardianRepairHints?.items).toHaveLength(2);
    expect(state.signals.repairEvaluation?.repairs?.[0].action).toBe('INSERT_REST');
    expect(state.signals.alerts?.some((a: { code: string }) => a.code === 'guardian_repair_hint')).toBe(true);
  });

  it('targets repair instructions to the day mentioned in concern text', () => {
    const hints = buildGuardianRepairHints({
      decision: 'CONDITIONAL_APPROVE',
      consensusLevel: 0.62,
      suggestedAdjustments: ['Day2 驾驶进入危险区，建议拆分'],
      sourcePhase: 'pre_repair',
      negotiatedAt: '2026-06-14T00:00:00.000Z',
    });

    const repairs = mapGuardianHintsToRepairInstructions(plan, hints);
    expect(repairs[0].targetSlotIds).toEqual(['s2']);
    expect(repairs[0].date).toBe('2026-06-02');
    expect(repairs[0].metadata?.dayIndex).toBe(2);
  });
});
