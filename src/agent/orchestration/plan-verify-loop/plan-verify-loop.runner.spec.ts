import { buildVerifyPhaseVerdict } from '../graph/nodes/verify-verdict.util';
import { runPlanVerifyOptimizeRepairLoop } from './plan-verify-loop.runner';
import type { PlanVerifyLoopHost } from './plan-verify-loop.host';
import type { PlanVerifyLoopRunParams } from './plan-verify-loop.types';

function baseParams(): PlanVerifyLoopRunParams {
  return {
    request: { request_id: 'pv-1', user_id: 'u', message: 'plan' } as PlanVerifyLoopRunParams['request'],
    context: {} as PlanVerifyLoopRunParams['context'],
    state: {
      request_id: 'pv-1',
      current_step: 'VERIFY',
      metadata: { last_updated_at: new Date().toISOString() },
      decision_log: [],
      errors: [],
      gate_result: { gate_result: 'PASS' },
    } as PlanVerifyLoopRunParams['state'],
    decisionState: {
      verification: { hasFatal: false, issues: [] },
    } as PlanVerifyLoopRunParams['decisionState'],
    llmProvider: 'deepseek' as PlanVerifyLoopRunParams['llmProvider'],
    startTime: Date.now(),
  };
}

function mockHost(overrides: Partial<PlanVerifyLoopHost> = {}): PlanVerifyLoopHost {
  return {
    touchAsyncTaskProgress: jest.fn(),
    maybeSnapshot: jest.fn(),
    runOptimizePhase: jest.fn(async (_s, ds) => ds),
    tryPlanGenEmptyDraftTerminal: jest.fn(async () => null),
    runVerifyPhase: jest.fn(async (ds, state) => ({
      decisionState: ds,
      verdict: buildVerifyPhaseVerdict(state, ds),
    })),
    syncConfidenceAfterVerify: jest.fn((_, ds) => ds),
    buildErrorResult: jest.fn(() => ({ status: 'FAILED' }) as ReturnType<PlanVerifyLoopHost['buildErrorResult']>),
    runRepairPhase: jest.fn(async (ds) => ds),
    computeRepairFatigue: jest.fn(() => undefined),
    buildClarificationResult: jest.fn(() => ({ status: 'NEED_USER_CONFIRMATION' }) as ReturnType<PlanVerifyLoopHost['buildClarificationResult']>),
    persistHarnessTraceOnReturnToResearch: jest.fn(),
    runPlanGenWithEmptyDraftGuard: jest.fn(),
    ...overrides,
  };
}

describe('runPlanVerifyOptimizeRepairLoop (graph)', () => {
  it('returns terminal_failed on VERIFY FATAL', async () => {
    const params = baseParams();
    params.decisionState = {
      verification: {
        hasFatal: true,
        issues: [{ class: 'FATAL', message: 'boom' }],
      },
    } as PlanVerifyLoopRunParams['decisionState'];

    const out = await runPlanVerifyOptimizeRepairLoop(mockHost(), params);
    expect(out.kind).toBe('terminal');
    if (out.kind === 'terminal') {
      expect(out.result.status).toBe('FAILED');
      expect(params.state.errors.some((e) => e.error_code === 'VERIFICATION_FATAL')).toBe(true);
    }
  });

  it('returns terminal_clarification when repair count exceeded', async () => {
    const params = baseParams();
    params.state.gate_result = { gate_result: 'ADJUST_REQUIRED' };
    params.state.errors = [{ step: 'VERIFY', error_code: 'X', message: 'm', timestamp: '' }];
    params.decisionState = {
      systemState: { repairCount: 99 },
      verification: { hasFatal: false, issues: [] },
    } as PlanVerifyLoopRunParams['decisionState'];

    const out = await runPlanVerifyOptimizeRepairLoop(mockHost(), params);
    expect(out.kind).toBe('terminal');
  });

  it('continues to narrate path when verify passes without repair', async () => {
    const out = await runPlanVerifyOptimizeRepairLoop(mockHost(), baseParams());
    expect(out.kind).toBe('continue');
  });

  it('reroute_pre_plan when VERIFY harness suggests RETURN_TO_RESEARCH (evidence binding)', async () => {
    const applyReturnToResearchInvalidation = jest.fn(async (_s, ds) => ds);
    const out = await runPlanVerifyOptimizeRepairLoop(
      mockHost({
        runVerifyPhase: jest.fn(async (ds, state) => {
          const decisionState = {
            ...(ds as object),
            harnessRuntime: {
              last_harness_failure_events: [
                { step: 'VERIFY', code: 'EVIDENCE_SNAPSHOT_UNBOUND', severity: 'L2' },
              ],
            },
            verification: { hasFatal: false, issues: [] },
          } as PlanVerifyLoopRunParams['decisionState'];
          return {
            decisionState,
            verdict: buildVerifyPhaseVerdict(state, decisionState),
          };
        }),
        applyReturnToResearchInvalidation,
      }),
      baseParams(),
    );
    expect(out.kind).toBe('reroute_pre_plan');
    if (out.kind === 'reroute_pre_plan') {
      expect(out.entry).toBe('research');
    }
    expect(applyReturnToResearchInvalidation).toHaveBeenCalled();
  });
});
