import { StateUpdateOrchestratorNode } from './state-update.node';
import type { StateUpdateNodeHost } from './state-update-node.host';
import type { StateUpdatePrePlanSegmentInput } from './base.node';

describe('StateUpdateOrchestratorNode', () => {
  const prePlan = {
    startTime: Date.now(),
    maybeStopAfter: () => ({ kind: 'completed' as const, lastNode: 'state_update' as const, decisionState: undefined }),
    prePlanTerminal: () => ({
      kind: 'terminal' as const,
      terminal: 'terminal_clarification' as const,
      result: {} as any,
      decisionState: undefined,
    }),
  };

  it('runs state update pipeline and stops when maybeStopAfter fires', async () => {
    const host: StateUpdateNodeHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() } as any,
      executeStateUpdateStep: jest.fn().mockResolvedValue({ requestId: 'r1' }),
      applyRelaxationFingerprintToDso: jest.fn().mockImplementation(async (_s, d) => d),
      maybeHaltTerminalNoSolution: jest.fn().mockResolvedValue(null),
      maybeHaltHardGapsClarification: jest.fn().mockResolvedValue(null),
      applyResearchScopeInvalidationCow: jest.fn().mockResolvedValue(undefined),
      maybeSnapshot: jest.fn(),
    };
    const node = new StateUpdateOrchestratorNode(host);
    const input = {
      request: {} as any,
      context: {} as any,
      state: { request_id: 'r1', metadata: {}, decision_log: [] } as any,
      decisionState: undefined,
      llmProvider: 'anthropic' as any,
      startTime: Date.now(),
      systemRequestId: 'r1',
      logger: host.logger,
      prePlan,
    } satisfies StateUpdatePrePlanSegmentInput;

    const segment = await node.runPrePlanSegment(input);
    expect(segment.kind).toBe('completed');
    expect(host.executeStateUpdateStep).toHaveBeenCalled();
    expect(host.applyResearchScopeInvalidationCow).toHaveBeenCalled();
  });

  it('returns terminal when hard gaps clarification halts', async () => {
    const host: StateUpdateNodeHost = {
      logger: { log: jest.fn(), debug: jest.fn() } as any,
      executeStateUpdateStep: jest.fn().mockResolvedValue(undefined),
      applyRelaxationFingerprintToDso: jest.fn().mockImplementation(async (_s, d) => d),
      maybeHaltTerminalNoSolution: jest.fn().mockResolvedValue(null),
      maybeHaltHardGapsClarification: jest.fn().mockResolvedValue({
        kind: 'terminal',
        terminal: 'terminal_clarification',
        result: {},
        decisionState: undefined,
      }),
      applyResearchScopeInvalidationCow: jest.fn(),
      maybeSnapshot: jest.fn(),
    };
    const node = new StateUpdateOrchestratorNode(host);
    const input = {
      request: {} as any,
      context: {} as any,
      state: { request_id: 'r1', metadata: {}, decision_log: [] } as any,
      decisionState: undefined,
      llmProvider: 'anthropic' as any,
      startTime: Date.now(),
      systemRequestId: 'r1',
      logger: host.logger,
      prePlan: { ...prePlan, maybeStopAfter: () => null },
    } satisfies StateUpdatePrePlanSegmentInput;

    const segment = await node.runPrePlanSegment(input);
    expect(segment.kind).toBe('terminal');
    expect(host.applyResearchScopeInvalidationCow).not.toHaveBeenCalled();
  });
});
