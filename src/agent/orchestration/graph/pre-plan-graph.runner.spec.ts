import { PRE_PLAN_NODE_ORDER, resolvePrePlanNext } from './pre-plan-graph.runner';
import type { PrePlanGraphHost } from './pre-plan-graph.host';
import type { GraphNodeOutcome, OrchestrationNodeId } from './orchestration-graph.types';
import { runPrePlanUntilContextBuild } from './pre-plan-graph.runner';

describe('pre-plan-graph.runner', () => {
  it('resolvePrePlanNext walks intake → context_build', () => {
    expect(resolvePrePlanNext('intake')).toBe('state_update');
    expect(resolvePrePlanNext('gate_eval')).toBe('context_build');
    expect(resolvePrePlanNext('context_build')).toBe('END');
  });

  it('runs one segment per scheduler node', async () => {
    const order: OrchestrationNodeId[] = [];
    const host: PrePlanGraphHost = {
      async runPrePlanNode(nodeId): Promise<GraphNodeOutcome> {
        order.push(nodeId);
        return { kind: 'continue', decisionState: undefined };
      },
    };
    await runPrePlanUntilContextBuild(host, {
      request: { request_id: 't', user_id: 'u', message: 'hi' } as any,
      context: {} as any,
      state: {
        request_id: 't',
        current_step: 'INTAKE',
        metadata: { last_updated_at: new Date().toISOString() },
        decision_log: [],
        errors: [],
      } as any,
      decisionState: undefined,
      llmProvider: 'deepseek' as any,
      startTime: Date.now(),
    });
    expect(order).toEqual(PRE_PLAN_NODE_ORDER);
  });
});
