import { OrchestrationGraphScheduler } from './orchestration-graph.scheduler';
import type {
  GraphNodeOutcome,
  OrchestrationGraphNodeHandler,
  OrchestrationNodeId,
  SharedRunContext,
} from './orchestration-graph.types';

function minimalCtx(): SharedRunContext {
  return {
    request: { request_id: 't-1', user_id: 'u', message: 'hi' } as SharedRunContext['request'],
    context: {} as SharedRunContext['context'],
    state: {
      request_id: 't-1',
      current_step: 'INTAKE',
      metadata: { last_updated_at: new Date().toISOString() },
      decision_log: [],
      errors: [],
    } as SharedRunContext['state'],
    decisionState: undefined,
    llmProvider: 'deepseek' as SharedRunContext['llmProvider'],
    startTime: Date.now(),
  };
}

describe('OrchestrationGraphScheduler', () => {
  it('runs linear nodes until complete outcome', async () => {
    const order: OrchestrationNodeId[] = [];
    const handler: OrchestrationGraphNodeHandler = {
      runNode: async (nodeId): Promise<GraphNodeOutcome> => {
        order.push(nodeId);
        if (nodeId === 'optimize') return { kind: 'continue' };
        if (nodeId === 'verify') return { kind: 'complete' };
        return { kind: 'continue' };
      },
    };
    const scheduler = new OrchestrationGraphScheduler();
    const out = await scheduler.run(handler, minimalCtx(), {
      entry: 'optimize',
      resolveNext: (from) => (from === 'optimize' ? 'verify' : undefined),
      maxSteps: 4,
    });
    expect(out.kind).toBe('completed');
    expect(order).toEqual(['optimize', 'verify']);
  });

  it('returns terminal when node requests it', async () => {
    const handler: OrchestrationGraphNodeHandler = {
      runNode: async (): Promise<GraphNodeOutcome> => ({
        kind: 'terminal',
        terminal: 'terminal_failed',
        result: { status: 'FAILED' } as GraphNodeOutcome extends { kind: 'terminal' } ? GraphNodeOutcome['result'] : never,
      }),
    };
    const scheduler = new OrchestrationGraphScheduler();
    const out = await scheduler.run(handler, minimalCtx(), { entry: 'verify', maxSteps: 2 });
    expect(out.kind).toBe('terminal');
    if (out.kind === 'terminal') {
      expect(out.terminal).toBe('terminal_failed');
    }
  });

  it('throws TIMEOUT when deadline expired', async () => {
    const handler: OrchestrationGraphNodeHandler = {
      runNode: async (): Promise<GraphNodeOutcome> => ({ kind: 'continue' }),
    };
    const scheduler = new OrchestrationGraphScheduler();
    await expect(
      scheduler.run(handler, {
        ...minimalCtx(),
        deadline: { remainingMs: () => 0 },
      }, { entry: 'optimize', maxSteps: 2 }),
    ).rejects.toThrow(/TIMEOUT/);
  });
});
