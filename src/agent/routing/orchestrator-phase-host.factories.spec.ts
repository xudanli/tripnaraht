import {
  createFeedbackPhaseHost,
  createHallucinationPhaseHost,
  createNarratePhaseHost,
  createOptimizePhaseHost,
  createPostPlanGraphHost,
} from './orchestrator-phase-host.factories';

describe('orchestrator-phase-host.factories', () => {
  it('wires optimize phase host callbacks', () => {
    const host = createOptimizePhaseHost({
      logger: { debug: jest.fn(), warn: jest.fn(), log: jest.fn(), error: jest.fn() },
      decisionKernel: {},
      computePlanDraftFatigue: jest.fn(() => 0.5),
    });
    expect(host.computeOptimizeFatigue(undefined)).toBe(0.5);
  });

  it('wires narrate / feedback / hallucination / post-plan hosts', () => {
    const svc = {
      logger: { debug: jest.fn(), warn: jest.fn(), log: jest.fn(), error: jest.fn() },
      decisionKernel: {},
      narratorAgent: {},
      hallucinationDetection: {},
      resolveDosExecutionContext: jest.fn(() => null),
      kernelCreateInitialOpts: jest.fn(() => ({})),
      isDsoAsPrimary: jest.fn(() => true),
      recordPoiPlanningOutcomeAfterItinerary: jest.fn(),
      touchAsyncTaskProgress: jest.fn(),
      maybeSnapshot: jest.fn(),
      buildSuccessResult: jest.fn(() => ({ ok: true })),
      buildErrorResult: jest.fn(() => ({ ok: false })),
    };
    expect(createNarratePhaseHost(svc).memoryReplayDecisionSource).toBeTruthy();
    expect(createFeedbackPhaseHost(svc).isDsoAsPrimary()).toBe(true);
    expect(createHallucinationPhaseHost(svc).hallucinationDetection).toBe(svc.hallucinationDetection);
    const post = createPostPlanGraphHost(svc);
    expect(post.buildSuccessResult({} as any, 0, undefined, {} as any)).toEqual({ ok: true });
  });
});
