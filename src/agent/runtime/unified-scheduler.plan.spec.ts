import { planUnifiedSchedulerTick } from './unified-scheduler.plan';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';

function ecps(over: Partial<ExecutionDecision>): ExecutionDecision {
  return {
    mode: 'RECOMPUTE',
    kernel: 'REASONING_KERNEL',
    features: {
      intensity: 0.5,
      entropy: 0.3,
      determinism: 0.5,
      toolDepth: 'MEDIUM',
    },
    toolDepth: 'MEDIUM',
    invalidationScope: 'NONE',
    confidenceGate: 'MEDIUM',
    ...over,
  };
}

describe('unified-scheduler.plan', () => {
  it('includes REPLAY_VERIFY when replayEligible', () => {
    const p = planUnifiedSchedulerTick({
      queryId: 'q',
      replayEligible: true,
      ecpsDecision: ecps({ mode: 'REUSE', invalidationScope: 'NONE' }),
    });
    expect(p.phases[p.phases.length - 1]).toBe('REPLAY_VERIFY');
    expect(p.notes.some((n) => n.startsWith('ECPS_MODE:'))).toBe(true);
  });

  it('short path for REUSE + no invalidation', () => {
    const p = planUnifiedSchedulerTick({
      queryId: 'q',
      replayEligible: false,
      ecpsDecision: ecps({ mode: 'REUSE', invalidationScope: 'NONE' }),
    });
    expect(p.phases).toEqual(['ROUTE', 'PERSIST']);
  });
});
