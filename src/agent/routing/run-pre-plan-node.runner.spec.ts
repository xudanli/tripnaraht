import { runPrePlanNode } from './run-pre-plan-node.runner';
import type { RunPrePlanNodeHost } from './run-pre-plan-node.host';
import { PRE_PLAN_NODE_ORDER } from '../orchestration/graph';

describe('run-pre-plan-node.runner', () => {
  it('skips nodes before entry', async () => {
    const runPrePlanFullChain = jest.fn();
    const host = { runPrePlanFullChain } as unknown as RunPrePlanNodeHost;
    const entry = PRE_PLAN_NODE_ORDER[2];
    const before = PRE_PLAN_NODE_ORDER[0];
    const out = await runPrePlanNode(host, before, {
      decisionState: { id: 'd1' },
      entry,
    } as any);
    expect(out).toEqual({ kind: 'continue', decisionState: { id: 'd1' } });
    expect(runPrePlanFullChain).not.toHaveBeenCalled();
  });

  it('runs segment when node is at/after entry', async () => {
    const runPrePlanFullChain = jest.fn(async () => ({
      kind: 'continue',
      decisionState: { id: 'd2' },
    }));
    const host = { runPrePlanFullChain } as unknown as RunPrePlanNodeHost;
    const nodeId = PRE_PLAN_NODE_ORDER[0];
    const out = await runPrePlanNode(host, nodeId, {
      decisionState: { id: 'd1' },
      entry: nodeId,
    } as any);
    expect(out.kind).toBe('continue');
    expect(runPrePlanFullChain).toHaveBeenCalled();
  });
});
