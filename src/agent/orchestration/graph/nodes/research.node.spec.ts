import { ResearchOrchestratorNode } from './research.node';
import type { ResearchNodeHost } from './research-node.host';
import type { ResearchPrePlanSegmentInput } from './base.node';

describe('ResearchOrchestratorNode', () => {
  it('delegates pre_plan segment to host pipeline', async () => {
    const host: ResearchNodeHost = {
      logger: { warn: jest.fn(), log: jest.fn(), debug: jest.fn() } as any,
      touchAsyncTaskProgress: jest.fn(),
      executeResearchPhase: jest.fn().mockResolvedValue({} as any),
      maybeSnapshot: jest.fn(),
      maybeInterceptDegradedTransportEvidence: jest.fn().mockReturnValue(null),
      clearTransportClarifyReinjectFlag: jest.fn(),
      runShadowConflictEarlyWarning: jest.fn().mockResolvedValue(undefined),
      applyIntakePredictiveFailureReport: jest.fn(),
      runEarlyWarningClarificationIntercept: jest.fn().mockResolvedValue(null),
    };
    const node = new ResearchOrchestratorNode(host);
    const input = {
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
        maybeStopAfter: () => ({ kind: 'completed' as const, lastNode: 'research' as const, decisionState: undefined }),
        prePlanTerminal: () => ({ kind: 'terminal' as const, terminal: 'terminal_done' as const, result: {} as any, decisionState: undefined }),
      },
    } satisfies ResearchPrePlanSegmentInput;

    const segment = await node.runPrePlanSegment(input);
    expect(segment.kind).toBe('completed');
    expect(host.executeResearchPhase).toHaveBeenCalled();
  });
});
