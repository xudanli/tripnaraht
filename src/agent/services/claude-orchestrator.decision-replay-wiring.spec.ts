import { ClaudeOrchestratorService } from './claude-orchestrator.service';

describe('ClaudeOrchestratorService DecisionReplay wiring', () => {
  beforeEach(() => {
    process.env.DECISION_REPLAY_AUTO_SNAPSHOT = '1';
  });

  afterEach(() => {
    delete process.env.DECISION_REPLAY_AUTO_SNAPSHOT;
  });

  it('creates snapshots at phase boundaries when DecisionReplayService injected', async () => {
    const createSnapshot = jest.fn();
    const decisionReplay: any = { createSnapshot };

    const svc: any = new ClaudeOrchestratorService(
      {} as any, // llmService
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    // Inject replay service directly (avoid brittle constructor-arity coupling in tests).
    svc.decisionReplay = decisionReplay;

    // Stub step executors to avoid heavy dependencies. Ensure they set current_step.
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
    svc.executeNarrateStep = async (_req: any, _ctx: any, state: any) => {
      state.current_step = 'NARRATE';
    };
    svc.executeFeedbackStep = async (state: any, dso: any) => {
      state.current_step = 'FEEDBACK';
      return dso;
    };
    svc.executeHallucinationDetectionStep = async () => {};
    svc.buildSuccessResult = (state: any) => ({ ok: true, state });

    const req: any = { request_id: 'r1', options: {} };
    const ctx: any = {};

    const result = await svc.orchestrateWithStateMachine(req, ctx);
    expect(result.ok).toBe(true);

    // We should have multiple snapshots; at least one AUTO and final CHECKPOINT.
    expect(createSnapshot).toHaveBeenCalled();
    const triggers = createSnapshot.mock.calls.map((c: any[]) => c[1]);
    expect(triggers).toContain('AUTO');
    expect(triggers).toContain('CHECKPOINT');
  });
});

