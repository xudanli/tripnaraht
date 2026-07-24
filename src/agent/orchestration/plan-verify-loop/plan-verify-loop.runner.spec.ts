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
    logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
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
    applyReturnToResearchInvalidation: jest.fn(async (_s, ds) => ds),
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

  it('loops repair back to verify before exiting subgraph', async () => {
    let verifyCalls = 0;
    const runVerifyPhase = jest.fn(async (ds, state) => {
      verifyCalls += 1;
      if (verifyCalls === 1) {
        state.errors = [
          {
            step: 'VERIFY',
            error_code: 'X',
            message: 'needs fix',
            timestamp: new Date().toISOString(),
          },
        ];
        state.gate_result = { gate_result: 'ADJUST_REQUIRED' };
        return {
          decisionState: ds,
          verdict: { kind: 'needs_repair' as const },
        };
      }
      state.errors = [];
      state.gate_result = { gate_result: 'PASS' };
      return {
        decisionState: ds,
        verdict: { kind: 'complete' as const },
      };
    });

    const runRepairPhase = jest.fn(async (ds) => ds);

    const out = await runPlanVerifyOptimizeRepairLoop(
      mockHost({ runVerifyPhase, runRepairPhase }),
      baseParams(),
    );

    expect(out.kind).toBe('continue');
    expect(verifyCalls).toBe(2);
    expect(runRepairPhase).toHaveBeenCalledTimes(1);
  });

  it('exits to narrate when repair budget exceeded and flawed draft allowed (no repair↔verify spin)', async () => {
    let verifyCalls = 0;
    const runVerifyPhase = jest.fn(async (ds, state) => {
      verifyCalls += 1;
      state.errors = [
        {
          step: 'VERIFY',
          error_code: 'SOFT_ISSUE',
          message: 'needs fix',
          timestamp: new Date().toISOString(),
        },
      ];
      state.gate_result = { gate_result: 'ADJUST_REQUIRED' };
      return { decisionState: ds, verdict: { kind: 'needs_repair' as const } };
    });
    const runRepairPhase = jest.fn(async (ds) => ({
      ...ds,
      systemState: { ...(ds as any).systemState, repairCount: 3 },
    }));

    const params = baseParams();
    params.request = {
      ...params.request,
      trip_id: 'trip_15c50a69931845ca',
      message: '请将7月22日住宿改为格伦达菲厄泽宾馆',
      options: { allow_flawed_draft_narrate: true },
    } as PlanVerifyLoopRunParams['request'];
    params.decisionState = {
      systemState: { repairCount: 2 },
      verification: { hasFatal: false, issues: [] },
    } as PlanVerifyLoopRunParams['decisionState'];

    const out = await runPlanVerifyOptimizeRepairLoop(
      mockHost({ runVerifyPhase, runRepairPhase }),
      params,
    );

    expect(out.kind).toBe('continue');
    expect(verifyCalls).toBe(1);
    expect(runRepairPhase).toHaveBeenCalledTimes(1);
    expect((params.state.metadata as Record<string, unknown>).flawed_draft_narrate).toBe(true);
    expect((params.state.metadata as Record<string, unknown>).flawed_draft_opt_in).toBe('explicit');
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
