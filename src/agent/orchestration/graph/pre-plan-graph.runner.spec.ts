import {
  PRE_PLAN_NODE_ORDER,
  resolvePrePlanNext,
  runPrePlanUntilContextBuild,
} from './pre-plan-graph.runner';
import type { PrePlanGraphHost } from './pre-plan-graph.host';
import type { GraphNodeOutcome, OrchestrationNodeId } from './orchestration-graph.types';

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

  it('forcePrePlanIntakeEntry starts at intake even when resumeSkipIntake', async () => {
    const order: OrchestrationNodeId[] = [];
    const host: PrePlanGraphHost = {
      async runPrePlanNode(nodeId): Promise<GraphNodeOutcome> {
        order.push(nodeId);
        return { kind: 'continue', decisionState: undefined };
      },
    };
    await runPrePlanUntilContextBuild(host, {
      request: { request_id: 't', user_id: 'u', message: '旷野静几天' } as any,
      context: { routingTaskType: 'TRIP_PLANNING' } as any,
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
      resumeSkipIntake: true,
      entry: 'state_update',
      forcePrePlanIntakeEntry: true,
    });
    expect(order[0]).toBe('intake');
    expect(order).toEqual(PRE_PLAN_NODE_ORDER);
  });
});
