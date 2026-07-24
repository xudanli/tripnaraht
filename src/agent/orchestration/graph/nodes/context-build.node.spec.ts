import { ContextBuildOrchestratorNode } from './context-build.node';
import type { ContextBuildNodeHost } from './context-build-node.host';
import type { ContextBuildPrePlanSegmentInput } from './base.node';

describe('ContextBuildOrchestratorNode', () => {
  it('delegates context build and honors stopAfter', async () => {
    const host: ContextBuildNodeHost = {
      logger: { debug: jest.fn() } as any,
      executeContextBuildStep: jest.fn().mockResolvedValue({ requestId: 'r1' }),
      maybeSnapshot: jest.fn(),
    };
    const node = new ContextBuildOrchestratorNode(host);
    const segment = await node.runPrePlanSegment({
      request: {} as any,
      context: {} as any,
      state: { request_id: 'r1', metadata: {}, decision_log: [] } as any,
      decisionState: undefined,
      llmProvider: 'anthropic' as any,
      startTime: Date.now(),
      systemRequestId: 'r1',
      logger: host.logger,
      prePlan: {
        startTime: Date.now(),
        maybeStopAfter: () => ({ kind: 'completed' as const, lastNode: 'context_build' as const, decisionState: undefined }),
        prePlanTerminal: () => ({ kind: 'terminal' as const, terminal: 'terminal_done' as const, result: {} as any, decisionState: undefined }),
      },
    } satisfies ContextBuildPrePlanSegmentInput);
    expect(segment.kind).toBe('completed');
    expect(host.executeContextBuildStep).toHaveBeenCalled();
    expect(host.maybeSnapshot).toHaveBeenCalledWith(expect.anything(), 'AUTO');
  });
});
