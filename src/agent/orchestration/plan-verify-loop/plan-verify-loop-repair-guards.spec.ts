import { checkRepairCountExceededIfNeeded } from './plan-verify-loop-repair-guards';
import type { PlanVerifyLoopRepairGuardHost } from './plan-verify-loop-repair-guards';
import {
  createPlanVerifyTransientState,
  type PlanVerifyTransientLoopState,
} from './plan-verify-loop-transient.util';
import type { PlanVerifyLoopRunParams } from './plan-verify-loop.types';

function mockHost(): PlanVerifyLoopRepairGuardHost {
  return {
    logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    computeRepairFatigue: jest.fn(),
    buildClarificationResult: jest.fn(() => ({ status: 'NEED_USER_CONFIRMATION' }) as any),
    maybeSnapshot: jest.fn(),
  };
}

describe('plan-verify-loop-repair-guards — flawed draft narrate', () => {
  it('continues without clarification when allow_flawed_draft_narrate', () => {
    const host = mockHost();
    const decisionState = { systemState: { repairCount: 3 } } as PlanVerifyLoopRunParams['decisionState'];
    const loop: PlanVerifyTransientLoopState = createPlanVerifyTransientState(decisionState);
    const params = {
      request: {
        request_id: 'fd-1',
        user_id: 'u',
        message: 'plan',
        options: { allow_flawed_draft_narrate: true },
      },
      context: {},
      state: { request_id: 'fd-1', metadata: {}, decision_log: [], errors: [] },
      decisionState,
      llmProvider: 'deepseek',
      startTime: Date.now(),
      loop,
    } as PlanVerifyLoopRunParams & { loop: PlanVerifyTransientLoopState };

    const terminal = checkRepairCountExceededIfNeeded(host, params);
    expect(terminal).toBeNull();
    expect((params.state.metadata as Record<string, unknown>).flawed_draft_narrate).toBe(true);
    expect(host.buildClarificationResult).not.toHaveBeenCalled();
  });
});
