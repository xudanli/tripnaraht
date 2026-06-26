import { TripClosedLoopService } from './trip-closed-loop.service';
import type { TripPlan } from '../plan-model';

describe('TripClosedLoopService', () => {
  const service = new TripClosedLoopService();

  it('blocks plans with hard weather execution violations', () => {
    const report = service.evaluate({
      version: 'test',
      createdAt: '2026-06-21T00:00:00.000Z',
      days: [
        {
          day: 1,
          date: '2026-07-10',
          timeSlots: [slot('glacier-hike', '08:00')],
          weatherExecution: {
            executionState: 'BLOCKED',
            violation: 'HARD',
            safeScore: undefined as never,
            explanation: 'High wind closes the glacier activity window.',
            hazardKinds: ['wind'],
          },
        },
      ],
    } as TripPlan);

    expect(report.status).toBe('blocked');
    expect(report.hardViolations).toHaveLength(1);
    expect(report.repairSuggestions.some(suggestion => suggestion.mode === 'safer')).toBe(true);
  });

  it('simulates moving a slot before evaluating the next state', () => {
    const state = service.buildState({
      version: 'test',
      createdAt: '2026-06-21T00:00:00.000Z',
      days: [
        { day: 1, date: '2026-07-10', timeSlots: [slot('a', '09:00')] },
        { day: 2, date: '2026-07-11', timeSlots: [] },
      ],
      metrics: { robustnessScore: 0.8 },
    });

    const report = service.evaluate(state, {
      type: 'MOVE_SLOT',
      slotId: 'a',
      targetDate: '2026-07-11',
      targetTime: '10:30',
    });

    expect(report.status).toBe('safe');
    expect(report.simulatedState.plan.days[0].timeSlots).toHaveLength(0);
    expect(report.simulatedState.plan.days[1].timeSlots[0].time).toBe('10:30');
    expect(report.simulatedState.actionHistory).toHaveLength(1);
  });

  it('flags overloaded days and proposes removing an optional slot', () => {
    const report = service.evaluate({
      version: 'test',
      createdAt: '2026-06-21T00:00:00.000Z',
      days: [
        {
          day: 1,
          date: '2026-07-10',
          timeSlots: [
            slot('a', '08:00'),
            slot('b', '09:00'),
            slot('c', '10:00'),
            slot('d', '11:00'),
            slot('e', '12:00'),
            { ...slot('f', '13:00'), priorityTag: 'optional' },
          ],
        },
      ],
      metrics: { robustnessScore: 0.7 },
    });

    expect(report.status).toBe('risky');
    expect(report.softRisks.some(issue => issue.domain === 'pace')).toBe(true);
    expect(report.repairSuggestions[0]?.actions[0]).toMatchObject({
      type: 'REMOVE_SLOT',
      slotId: 'f',
    });
  });

  it('builds stable UI hints from a decision report', () => {
    const report = service.evaluate({
      version: 'test',
      createdAt: '2026-06-21T00:00:00.000Z',
      days: [
        {
          day: 1,
          date: '2026-07-10',
          timeSlots: [slot('a', '08:00')],
          weatherExecution: {
            executionState: 'HIGH_RISK',
            violation: 'SOFT',
            safeScore: undefined as never,
            explanation: 'Strong wind may delay exposed outdoor activities.',
          },
        },
      ],
      metrics: { robustnessScore: 0.6 },
    } as TripPlan);

    const hints = service.buildUiHints(report);

    expect(hints).toMatchObject({
      status: 'risky',
      tone: 'caution',
      counts: { hard: 0, soft: 1, uncertainty: 0 },
    });
    expect(hints.primaryIssues[0]).toMatchObject({
      severity: 'warn',
      domain: 'weather',
    });
    expect(hints.actionHints[0]?.mode).toBe('safer');
  });
});

function slot(id: string, time: string) {
  return {
    id,
    time,
    title: id,
    type: 'nature' as const,
  };
}
