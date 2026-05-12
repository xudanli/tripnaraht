import { applyAccumulatedGlobalSlackToPlanDays } from './apply-accumulated-global-slack-to-plan';
import type { TripPlan } from '../plan-model';

describe('applyAccumulatedGlobalSlackToPlanDays', () => {
  it('writes accumulatedGlobalSlackMinutes from ACCUMULATE_GLOBAL_SLACK drifts', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-07-01',
          weatherExecution: { executionState: 'DEGRADED' },
          timeSlots: [],
        },
      ],
    };
    plan.temporal = {
      emittedAt: '2026-01-01T00:00:00.000Z',
      timeDrifts: [
        {
          id: 'slack1',
          date: '2026-07-01',
          sourceSlotId: 'head',
          deltaMinutes: 25,
          confidence: 0.5,
          propagationPolicy: 'ACCUMULATE_GLOBAL_SLACK',
          cause: { kind: 'WEATHER_EXECUTION_QUALITY' },
        },
      ],
      constraintEdges: [],
    };

    applyAccumulatedGlobalSlackToPlanDays(plan);
    expect(plan.days[0].weatherExecution?.accumulatedGlobalSlackMinutes).toBe(25);
  });
});
