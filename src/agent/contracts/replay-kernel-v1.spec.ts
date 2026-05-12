// src/agent/contracts/replay-kernel-v1.spec.ts
import { buildOrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import {
  assertReplayEquivalence,
  replayKernelV1FromTrace,
  ReplayKernelV1,
} from './replay-kernel-v1';

function mkTrace(fp: string): ReturnType<typeof buildOrchestrationExecutionTraceV1> {
  return buildOrchestrationExecutionTraceV1({
    snapshotId: 'snap-pure-1',
    modelFingerprint: fp,
    selectedExecutionModelVersion: 'v1',
    selectionReason: 'exact_match',
    runtimeHint: null,
    route: {
      task_type: 'GENERIC_QA',
      route_policy_resolved: 'CLAUDE_SM',
      intent_mode_resolved: 'GENERIC_QA',
    },
  });
}

describe('ReplayKernelV1 (pure)', () => {
  const t = mkTrace('d'.repeat(64));

  it('replayKernelV1FromTrace is deterministic for same trace', () => {
    const a = replayKernelV1FromTrace(t);
    const b = replayKernelV1FromTrace(t);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.simulation.structural_signature).toBe(b.simulation.structural_signature);
      expect(a.simulation.context_hash).toBe(b.simulation.context_hash);
    }
  });

  it('ReplayKernelV1.replayFromTrace matches namespace', () => {
    expect(ReplayKernelV1.replayFromTrace(t)).toEqual(replayKernelV1FromTrace(t));
  });

  it('assertReplayEquivalence detects drift', () => {
    const t2 = mkTrace('e'.repeat(64));
    const r = assertReplayEquivalence(t, t2);
    expect(r.equivalent).toBe(false);
    expect(r.mismatches).toContain('model_fingerprint');
  });

  it('assertReplayEquivalence accepts identical traces', () => {
    const r = assertReplayEquivalence(t, mkTrace('d'.repeat(64)));
    expect(r.equivalent).toBe(true);
    expect(r.mismatches).toHaveLength(0);
  });
});
