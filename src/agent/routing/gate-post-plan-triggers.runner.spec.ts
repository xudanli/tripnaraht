import {
  maybeTriggerDecisionProfilingQuiz,
  maybeTriggerProcessFairnessRound,
} from './gate-post-plan-triggers.runner';
import type { GatePostPlanTriggersHost } from './gate-post-plan-triggers.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('gate-post-plan-triggers.runner', () => {
  const baseState = {
    request_id: 'r1',
    decision_log: [],
    metadata: { tripId: 't1', userId: 'u1' },
  } as unknown as OrchestratorState;
  const request = {
    request_id: 'r1',
    trip_id: 't1',
    user_id: 'u1',
    message: 'hi',
  } as RouteAndRunRequestDto;

  it('skips decision profiling when orchestrator absent', async () => {
    const host: GatePostPlanTriggersHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    };
    await maybeTriggerDecisionProfilingQuiz(host, request, baseState);
    expect(baseState.decision_log).toHaveLength(0);
  });

  it('skips process fairness when orchestrator absent', async () => {
    const host: GatePostPlanTriggersHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
    };
    await maybeTriggerProcessFairnessRound(host, request, baseState);
    expect(baseState.decision_log).toHaveLength(0);
  });
});
