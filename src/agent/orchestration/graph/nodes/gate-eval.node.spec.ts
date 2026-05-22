import { GateEvalOrchestratorNode } from './gate-eval.node';
import type { GateEvalNodeHost } from './gate-eval-node.host';
import type { GateEvalPrePlanSegmentInput } from './base.node';

describe('GateEvalOrchestratorNode', () => {
  const prePlan = {
    startTime: Date.now(),
    maybeStopAfter: () => ({ kind: 'completed' as const, lastNode: 'gate_eval' as const, decisionState: undefined }),
    prePlanTerminal: (terminal: string, result: unknown) => ({
      kind: 'terminal' as const,
      terminal: terminal as 'terminal_blocked',
      result: result as any,
      decisionState: undefined,
    }),
  };

  it('continues when gate is not blocked', async () => {
    const host: GateEvalNodeHost = {
      logger: { debug: jest.fn() } as any,
      touchAsyncTaskProgress: jest.fn(),
      executeGateEvalPhase: jest.fn().mockResolvedValue({}),
      relaxGateForPartialIfEligible: jest.fn(),
      applyMarathonPipelineSignals: jest.fn(),
      maybeStartGuardiansDebateShadowAfterGate: jest.fn(),
      maybeAwaitGuardiansDebateFuseAndShortCircuit: jest.fn().mockResolvedValue(null),
      maybeSnapshot: jest.fn(),
      recordPoiPlanningOutcomeAfterItinerary: jest.fn(),
      buildBlockedResult: jest.fn(),
      isGateBlocked: jest.fn().mockReturnValue(false),
    };
    const node = new GateEvalOrchestratorNode(host);
    const state = { request_id: 'r1', metadata: {}, decision_log: [], gate_result: { gate_result: 'ALLOW' } } as any;
    const segment = await node.runPrePlanSegment({
      request: {} as any,
      context: {} as any,
      state,
      decisionState: undefined,
      llmProvider: 'anthropic' as any,
      startTime: Date.now(),
      systemRequestId: 'r1',
      logger: host.logger,
      prePlan,
    } satisfies GateEvalPrePlanSegmentInput);
    expect(segment.kind).toBe('completed');
    expect(host.executeGateEvalPhase).toHaveBeenCalled();
  });

  it('returns terminal_blocked when gate is BLOCK', async () => {
    const host: GateEvalNodeHost = {
      logger: { debug: jest.fn() } as any,
      touchAsyncTaskProgress: jest.fn(),
      executeGateEvalPhase: jest.fn().mockResolvedValue(undefined),
      relaxGateForPartialIfEligible: jest.fn(),
      applyMarathonPipelineSignals: jest.fn(),
      maybeStartGuardiansDebateShadowAfterGate: jest.fn(),
      maybeAwaitGuardiansDebateFuseAndShortCircuit: jest.fn().mockResolvedValue(null),
      maybeSnapshot: jest.fn(),
      recordPoiPlanningOutcomeAfterItinerary: jest.fn(),
      buildBlockedResult: jest.fn().mockReturnValue({ status: 'BLOCKED' }),
      isGateBlocked: jest.fn().mockReturnValue(true),
    };
    const node = new GateEvalOrchestratorNode(host);
    const segment = await node.runPrePlanSegment({
      request: {} as any,
      context: {} as any,
      state: { request_id: 'r1', metadata: {}, decision_log: [], gate_result: { gate_result: 'BLOCK' } } as any,
      decisionState: undefined,
      llmProvider: 'anthropic' as any,
      startTime: Date.now(),
      systemRequestId: 'r1',
      logger: host.logger,
      prePlan: { ...prePlan, maybeStopAfter: () => null },
    } satisfies GateEvalPrePlanSegmentInput);
    expect(segment.kind).toBe('terminal');
    expect(host.buildBlockedResult).toHaveBeenCalled();
  });
});
