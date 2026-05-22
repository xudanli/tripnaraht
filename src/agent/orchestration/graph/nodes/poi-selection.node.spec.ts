import { PoiSelectionOrchestratorNode } from './poi-selection.node';
import type { PoiSelectionNodeHost } from './poi-selection-node.host';
import type { PoiSelectionPrePlanSegmentInput } from './base.node';

describe('PoiSelectionOrchestratorNode', () => {
  const prePlan = {
    startTime: Date.now(),
    maybeStopAfter: () => ({ kind: 'completed' as const, lastNode: 'poi_selection' as const, decisionState: undefined }),
    prePlanTerminal: (terminal: string, result: unknown) => ({
      kind: 'terminal' as const,
      terminal: terminal as 'terminal_done',
      result: result as any,
      decisionState: undefined,
    }),
  };

  it('delegates to host and continues when selection succeeds', async () => {
    const host: PoiSelectionNodeHost = {
      logger: { log: jest.fn(), debug: jest.fn() } as any,
      executePoiSelectionStep: jest.fn().mockResolvedValue({
        needsClarification: false,
        allowWithFallback: false,
      }),
      maybeSnapshot: jest.fn(),
      applyFallbackPlan: jest.fn(),
      recordPoiPlanningOutcomeAfterItinerary: jest.fn(),
      buildSuccessResult: jest.fn(),
      buildClarificationResult: jest.fn(),
    };
    const node = new PoiSelectionOrchestratorNode(host);
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
    } satisfies PoiSelectionPrePlanSegmentInput;

    const segment = await node.runPrePlanSegment(input);
    expect(segment.kind).toBe('completed');
    expect(host.executePoiSelectionStep).toHaveBeenCalled();
  });

  it('returns terminal_clarification when needsClarification', async () => {
    const host: PoiSelectionNodeHost = {
      logger: { debug: jest.fn() } as any,
      executePoiSelectionStep: jest.fn().mockResolvedValue({
        needsClarification: true,
        allowWithFallback: false,
      }),
      maybeSnapshot: jest.fn(),
      applyFallbackPlan: jest.fn(),
      recordPoiPlanningOutcomeAfterItinerary: jest.fn(),
      buildSuccessResult: jest.fn(),
      buildClarificationResult: jest.fn().mockReturnValue({ status: 'NEED_USER_INPUT' }),
    };
    const node = new PoiSelectionOrchestratorNode(host);
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
    } satisfies PoiSelectionPrePlanSegmentInput;

    const segment = await node.runPrePlanSegment(input);
    expect(segment.kind).toBe('terminal');
    expect(host.buildClarificationResult).toHaveBeenCalled();
  });
});
