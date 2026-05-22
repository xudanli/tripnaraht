import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';

/** Minimal stubs so `orchestrateWithStateMachine` runs end-to-end without real LLM/skills. */
function createStubbedOrchestratorForStateMachineTest(decisionReplay?: { createSnapshot: jest.Mock }): any {
  const svc: any = new ClaudeOrchestratorService(
    {} as any, // llmService
    { trip: { findUnique: jest.fn().mockResolvedValue(null) } } as any, // prisma
    new RagRealityPolicyGateService(),
    ...(Array(54).fill(undefined) as undefined[]),
  );
  if (decisionReplay) {
    svc.decisionReplay = decisionReplay;
  }

  svc.getLlmProvider = () => 'anthropic';
  svc.executeIntakeStep = async (_req: any, _ctx: any, state: any) => {
    state.current_step = 'INTAKE';
  };
  svc.executeStateUpdateStep = async (state: any, dso: any) => {
    state.current_step = 'STATE_UPDATE';
    return dso;
  };
  svc.shouldReturnClarificationForHardGaps = () => false;
  svc.executeResearchPhase = async (dso: any, state: any) => {
    state.current_step = 'RESEARCH';
    return dso;
  };
  svc.executePoiSelectionStep = async (state: any) => {
    state.current_step = 'POI_SELECTION';
    return { allowWithFallback: false, needsClarification: false };
  };
  svc.executeGateEvalPhase = async (dso: any, state: any) => {
    state.current_step = 'GATE_EVAL';
    state.gate_result = { gate_result: 'ALLOW', violations: [], required_adjustments: [] };
    return dso;
  };
  svc.relaxGateForPartialIfEligible = () => {};
  svc.executeContextBuildStep = async (_req: any, _ctx: any, state: any, dso: any) => {
    state.current_step = 'CONTEXT_BUILD';
    return dso;
  };
  svc.executePlanGenPhase = async (dso: any, state: any) => {
    state.current_step = 'PLAN_GEN';
    return dso;
  };
  svc.executeOptimizeStep = async (state: any, dso: any) => {
    state.current_step = 'OPTIMIZE';
    return dso;
  };
  svc.executeVerifyPhase = async (dso: any, state: any) => {
    state.current_step = 'VERIFY';
    state.errors = [];
    return dso;
  };
  svc.syncConfidenceAfterVerify = (_state: any, dso: any) => dso;
  svc.executeRepairPhase = async (dso: any, state: any) => {
    state.current_step = 'REPAIR';
    return dso;
  };
  svc.buildSuccessResult = (state: any) => ({ ok: true, state });
  svc.asPostPlanGraphHost = function (this: any) {
    return {
      logger: this.logger,
      recordPoiPlanningOutcomeAfterItinerary: () => {},
      touchAsyncTaskProgress: () => {},
      maybeSnapshot: (st: any, trigger: any) => this.maybeSnapshot(st, trigger),
      runNarratePhase: async ({ state }: any) => {
        state.current_step = 'NARRATE';
      },
      runFeedbackPhase: async ({ state, decisionState }: any) => {
        state.current_step = 'FEEDBACK';
        return decisionState;
      },
      runHallucinationPhase: async () => {},
      buildSuccessResult: (state: any) => ({ ok: true, state }),
      resolveDosExecutionContext: () => null,
      kernelCreateInitialOpts: () => ({}),
      parseResearchConflictReport: () => undefined,
      readRealtimeRerollCount: () => 0,
      memoryReplayDecisionSource: 'memory_replay',
    };
  };
  return svc;
}

describe('ClaudeOrchestratorService DecisionReplay wiring', () => {
  beforeEach(() => {
    process.env.DECISION_REPLAY_AUTO_SNAPSHOT = '1';
  });

  afterEach(() => {
    delete process.env.DECISION_REPLAY_AUTO_SNAPSHOT;
  });

  it('creates snapshots at phase boundaries when DecisionReplayService injected', async () => {
    const createSnapshot = jest.fn();
    const svc = createStubbedOrchestratorForStateMachineTest({ createSnapshot });

    const req: any = { request_id: 'r1', options: {} };
    const ctx: any = {};

    const result = await svc.orchestrateWithStateMachine(req, ctx);
    expect(result.ok).toBe(true);

    expect(createSnapshot).toHaveBeenCalled();
    const triggers = createSnapshot.mock.calls.map((c: any[]) => c[1]);
    expect(triggers).toContain('AUTO');
    expect(triggers).toContain('CHECKPOINT');
  });

  it('seeds OrchestratorState.metadata.replan_context from request.options (PRD I3)', async () => {
    const svc = createStubbedOrchestratorForStateMachineTest();

    const req: any = {
      request_id: 'r-replan',
      user_id: 'u1',
      options: {
        previous_plan_version: 3,
        previous_world_snapshot_hash: 'snap-abc',
      },
    };
    const ctx: any = { tripRunId: '550e8400-e29b-41d4-a716-446655440000' };

    const result: any = await svc.orchestrateWithStateMachine(req, ctx);
    expect(result.ok).toBe(true);
    expect(result.state.metadata.replan_context).toEqual({
      previous_plan_version: 3,
      previous_world_snapshot_hash: 'snap-abc',
    });
    expect(result.state.metadata.tripRunId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(result.state.plan_version).toBe(4);
  });
});
