import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import {
  buildDedupRuntimeObservabilitySlice,
  buildRuntimeObservabilitySlice,
  shouldAttachDedupRuntimeObservability,
} from './dedup-runtime-adapter.util';
import { RUNTIME_UNIFIED_STATE_SCHEMA } from './runtime-state.types';

function decision(): ExecutionDecision {
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
    invalidationScope: 'FULL',
    confidenceGate: 'MEDIUM',
  };
}

describe('dedup-runtime-adapter.util', () => {
  it('buildDedupRuntimeObservabilitySlice returns unified state + plan', () => {
    const s = buildDedupRuntimeObservabilitySlice({
      requestId: 'req-1',
      artifactId: 'art-1',
      decision: decision(),
      replayEligible: true,
    });
    expect(s.unified_state.schema).toBe(RUNTIME_UNIFIED_STATE_SCHEMA);
    expect(s.unified_state.artifactRefs).toContain('art-1');
    expect(s.scheduler_plan.phases.length).toBeGreaterThan(0);
    expect(s.execution_graph?.nodes.some((n) => n.id.endsWith(':dedup_replay'))).toBe(true);
  });

  it('buildRuntimeObservabilitySlice with FRESH_EXECUTION labels fresh sink', () => {
    const s = buildRuntimeObservabilitySlice({
      requestId: 'req-2',
      artifactId: 'art-2',
      decision: decision(),
      replayEligible: false,
      pathKind: 'FRESH_EXECUTION',
    });
    expect(s.execution_graph?.nodes.some((n) => n.id.endsWith(':fresh_sink'))).toBe(true);
  });

  it('shouldAttachDedupRuntimeObservability follows env', () => {
    const prev = process.env.RUNTIME_MATERIALIZATION_OBS;
    process.env.RUNTIME_MATERIALIZATION_OBS = '0';
    expect(shouldAttachDedupRuntimeObservability()).toBe(false);
    process.env.RUNTIME_MATERIALIZATION_OBS = '1';
    expect(shouldAttachDedupRuntimeObservability()).toBe(true);
    if (prev === undefined) delete process.env.RUNTIME_MATERIALIZATION_OBS;
    else process.env.RUNTIME_MATERIALIZATION_OBS = prev;
  });
});
