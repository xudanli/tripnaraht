/**
 * 编排全链：reroute_pre_plan → pre_plan(entry=research) → plan_gen → plan_verify（子图 mock，顺序与 orchestrator 一致）
 */

import { runPrePlanUntilContextBuild } from '../graph/pre-plan-graph.runner';
import { runPlanVerifyOptimizeRepairLoop } from './plan-verify-loop.runner';
import { runVerifyReturnToResearchRetryLoop } from './verify-return-to-research-retry.runner';
import type { PlanGenWithEmptyDraftResult, PlanVerifyLoopOutcome } from './plan-verify-loop.types';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { GraphRunOutcome } from '../graph/orchestration-graph.types';

jest.mock('../graph/pre-plan-graph.runner', () => ({
  ...jest.requireActual('../graph/pre-plan-graph.runner'),
  runPrePlanUntilContextBuild: jest.fn(),
}));

jest.mock('./plan-verify-loop.runner', () => ({
  ...jest.requireActual('./plan-verify-loop.runner'),
  runPlanVerifyOptimizeRepairLoop: jest.fn(),
}));

const mockPrePlan = runPrePlanUntilContextBuild as jest.MockedFunction<typeof runPrePlanUntilContextBuild>;
const mockPlanVerify = runPlanVerifyOptimizeRepairLoop as jest.MockedFunction<
  typeof runPlanVerifyOptimizeRepairLoop
>;

const REQUEST_ID = 'orch-chain-1';

function orchestratorState(): OrchestratorState {
  return {
    request_id: REQUEST_ID,
    current_step: 'VERIFY',
    metadata: { last_updated_at: new Date().toISOString() },
    decision_log: [],
    errors: [],
  } as OrchestratorState;
}

function completedPrePlan(ds?: DecisionState): GraphRunOutcome {
  return { kind: 'completed', lastNode: 'context_build', decisionState: ds };
}

/** 与 `claude-orchestrator.service.ts` VERIFY→RESEARCH 重试块相同的 onRetry 接线 */
async function runOrchestratorStyleRetryChain(opts: {
  firstVerify: PlanVerifyLoopOutcome;
  secondVerify: PlanVerifyLoopOutcome;
  runPlanGen: () => Promise<PlanGenWithEmptyDraftResult>;
  maxRetries?: number;
}): Promise<{
  planVerifyOutcome: PlanVerifyLoopOutcome;
  prePlanEntries: Array<string | undefined>;
  planGenCalls: number;
  planVerifyCalls: number;
}> {
  const state = orchestratorState();
  let decisionState: DecisionState | undefined = { systemState: { requestId: REQUEST_ID } } as DecisionState;
  let planVerifyOutcome = opts.firstVerify;
  const prePlanEntries: Array<string | undefined> = [];

  mockPrePlan.mockImplementation(async (_host, params) => {
    prePlanEntries.push(params.entry);
    return completedPrePlan(params.decisionState);
  });
  mockPlanVerify.mockImplementation(async () => opts.secondVerify);

  const retryResult = await runVerifyReturnToResearchRetryLoop({
    state,
    planVerifyOutcome,
    decisionState,
    maxRetries: opts.maxRetries ?? 1,
    onRetry: async ({ decisionState: dsFromVerify }) => {
      const rePrePlan = await runPrePlanUntilContextBuild({} as never, {
        request: { request_id: REQUEST_ID } as never,
        context: {} as never,
        state,
        decisionState: dsFromVerify,
        llmProvider: 'deepseek' as never,
        startTime: Date.now(),
        deadline: undefined,
        resumeSkipIntake: true,
        entry: 'research',
      });
      if (rePrePlan.kind === 'terminal') {
        return {
          planVerifyOutcome,
          decisionState: rePrePlan.decisionState,
          prePlanTerminal: rePrePlan.result,
        };
      }
      let ds = rePrePlan.decisionState ?? dsFromVerify;
      const regen = await opts.runPlanGen();
      ds = regen.decisionState ?? ds;
      if (regen.terminal) {
        return { planVerifyOutcome, decisionState: ds, planGenTerminal: regen.terminal };
      }
      const reVerify = await runPlanVerifyOptimizeRepairLoop({} as never, {
        request: { request_id: REQUEST_ID } as never,
        context: {} as never,
        state,
        decisionState: ds,
        llmProvider: 'deepseek' as never,
        startTime: Date.now(),
      });
      return {
        planVerifyOutcome: reVerify,
        decisionState: reVerify.decisionState ?? ds,
      };
    },
  });

  planVerifyOutcome = retryResult.planVerifyOutcome;
  decisionState = retryResult.decisionState;

  return {
    planVerifyOutcome,
    prePlanEntries,
    planGenCalls: (opts.runPlanGen as jest.Mock).mock?.calls?.length ?? 0,
    planVerifyCalls: mockPlanVerify.mock.calls.length,
  };
}

describe('VERIFY RETURN_TO_RESEARCH orchestrator chain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DECISION_MAX_VERIFY_RESEARCH_RETRIES = '1';
  });

  it('reroute → pre_plan(research) → plan_gen → second plan_verify(continue)', async () => {
    const runPlanGen = jest.fn(async (): Promise<PlanGenWithEmptyDraftResult> => ({
      decisionState: { systemState: { requestId: REQUEST_ID, currentPhase: 'PLAN_GEN' } } as DecisionState,
    }));

    const firstVerify: PlanVerifyLoopOutcome = {
      kind: 'reroute_pre_plan',
      entry: 'research',
      decisionState: {
        harnessRuntime: {
          last_harness_failure_events: [{ step: 'VERIFY', code: 'EVIDENCE_SNAPSHOT_UNBOUND', severity: 'L2' }],
        },
      } as DecisionState,
    };
    const secondVerify: PlanVerifyLoopOutcome = { kind: 'continue', decisionState: undefined };

    const out = await runOrchestratorStyleRetryChain({
      firstVerify,
      secondVerify,
      runPlanGen,
    });

    expect(out.planVerifyOutcome.kind).toBe('continue');
    expect(out.prePlanEntries).toEqual(['research']);
    expect(runPlanGen).toHaveBeenCalledTimes(1);
    expect(out.planVerifyCalls).toBe(1);
    expect(mockPrePlan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entry: 'research', resumeSkipIntake: true }),
    );
  });

  it('stays reroute when max retries exhausted without second pre_plan', async () => {
    const runPlanGen = jest.fn(async () => ({ decisionState: undefined }));
    const reroute: PlanVerifyLoopOutcome = {
      kind: 'reroute_pre_plan',
      entry: 'research',
      decisionState: undefined,
    };

    const state = orchestratorState();
    const onRetry = jest.fn(async () => ({
      planVerifyOutcome: reroute,
      decisionState: undefined,
    }));

    const result = await runVerifyReturnToResearchRetryLoop({
      state,
      planVerifyOutcome: reroute,
      decisionState: undefined,
      maxRetries: 0,
      onRetry,
    });

    expect(result.planVerifyOutcome.kind).toBe('reroute_pre_plan');
    expect(onRetry).not.toHaveBeenCalled();
    expect(runPlanGen).not.toHaveBeenCalled();
  });
});
