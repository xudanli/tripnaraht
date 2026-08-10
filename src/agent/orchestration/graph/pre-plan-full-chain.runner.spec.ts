import { runPrePlanFullChain } from './pre-plan-full-chain.runner';
import type { PrePlanFullChainHost } from './pre-plan-full-chain.host';
import type { PrePlanGraphRunParams } from './pre-plan-graph.types';

describe('pre-plan-full-chain.runner', () => {
  it('skips nodes before entry and completes at context_build', async () => {
    const segment = jest.fn().mockResolvedValue({
      kind: 'continue',
      decisionState: { systemState: { version: 1 } },
    });
    const host: PrePlanFullChainHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      getIntakeNode: () => ({ runPrePlanSegment: segment }),
      getStateUpdateNode: () => ({ runPrePlanSegment: segment }),
      getResearchNode: () => ({ runPrePlanSegment: segment }),
      getPoiSelectionNode: () => ({ runPrePlanSegment: segment }),
      getGateEvalNode: () => ({ runPrePlanSegment: segment }),
      getContextBuildNode: () => ({ runPrePlanSegment: segment }),
    };
    const params = {
      entry: 'gate_eval',
      request: { request_id: 'r1' },
      context: {},
      state: { request_id: 'r1' },
      llmProvider: 'openai',
      startTime: Date.now(),
      decisionState: undefined,
    } as unknown as PrePlanGraphRunParams;

    const outcome = await runPrePlanFullChain(host, params);
    expect(outcome.kind).toBe('completed');
    // only gate_eval + context_build
    expect(segment).toHaveBeenCalledTimes(2);
  });
});
