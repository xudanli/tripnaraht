import {
  parseMaxVerifyResearchRetries,
  runVerifyReturnToResearchRetryLoop,
} from './verify-return-to-research-retry.runner';
import type { PlanVerifyLoopOutcome } from './plan-verify-loop.types';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

function baseState(): OrchestratorState {
  return {
    request_id: 'retry-1',
    current_step: 'VERIFY',
    metadata: { last_updated_at: new Date().toISOString() },
    decision_log: [],
    errors: [],
  } as OrchestratorState;
}

function rerouteOutcome(): PlanVerifyLoopOutcome {
  return {
    kind: 'reroute_pre_plan',
    entry: 'research',
    decisionState: { harnessRuntime: {} },
  };
}

describe('runVerifyReturnToResearchRetryLoop', () => {
  it('parseMaxVerifyResearchRetries reads env', () => {
    const prev = process.env.DECISION_MAX_VERIFY_RESEARCH_RETRIES;
    process.env.DECISION_MAX_VERIFY_RESEARCH_RETRIES = '2';
    expect(parseMaxVerifyResearchRetries()).toBe(2);
    if (prev === undefined) delete process.env.DECISION_MAX_VERIFY_RESEARCH_RETRIES;
    else process.env.DECISION_MAX_VERIFY_RESEARCH_RETRIES = prev;
  });

  it('invokes onRetry once then stops when second verify returns continue', async () => {
    const state = baseState();
    const onRetry = jest.fn(async (): Promise<import('./verify-return-to-research-retry.runner').VerifyReturnToResearchRetryAttemptResult> => ({
      planVerifyOutcome: { kind: 'continue', decisionState: undefined },
      decisionState: undefined,
    }));

    const result = await runVerifyReturnToResearchRetryLoop({
      state,
      planVerifyOutcome: rerouteOutcome(),
      decisionState: undefined,
      maxRetries: 1,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(result.planVerifyOutcome.kind).toBe('continue');
    expect((state.metadata as Record<string, unknown>).verify_return_to_research_count).toBe(1);
  });

  it('does not retry when maxRetries is 0', async () => {
    const onRetry = jest.fn();
    const result = await runVerifyReturnToResearchRetryLoop({
      state: baseState(),
      planVerifyOutcome: rerouteOutcome(),
      decisionState: undefined,
      maxRetries: 0,
      onRetry,
    });
    expect(onRetry).not.toHaveBeenCalled();
    expect(result.planVerifyOutcome.kind).toBe('reroute_pre_plan');
  });

  it('returns prePlan terminal without re-verify', async () => {
    const onRetry = jest.fn(async () => ({
      planVerifyOutcome: rerouteOutcome(),
      decisionState: undefined,
      prePlanTerminal: { status: 'FAILED' } as import('../../interfaces/claude-orchestration.interface').OrchestrationResult,
    }));

    const result = await runVerifyReturnToResearchRetryLoop({
      state: baseState(),
      planVerifyOutcome: rerouteOutcome(),
      decisionState: undefined,
      maxRetries: 1,
      onRetry,
    });
    expect(result.terminal?.status).toBe('FAILED');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
