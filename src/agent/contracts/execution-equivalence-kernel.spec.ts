// src/agent/contracts/execution-equivalence-kernel.spec.ts
import { buildOrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import { ExecutionEquivalenceKernel, stripEquivalenceNoise } from './execution-equivalence-kernel';

function baseTrace() {
  return buildOrchestrationExecutionTraceV1({
    snapshotId: 'snap-eq-1',
    modelFingerprint: '1'.repeat(64),
    selectedExecutionModelVersion: 'v1',
    selectionReason: 'exact_match',
    runtimeHint: 'noise-a',
    route: {
      task_type: 'GENERIC_QA',
      route_policy_resolved: 'LEGACY',
      intent_mode_resolved: 'GENERIC_QA',
    },
  });
}

describe('ExecutionEquivalenceKernel', () => {
  it('isSemanticallyEquivalent ignores runtime_hint mismatch', () => {
    const a = baseTrace();
    const b = { ...baseTrace(), runtime_hint: 'noise-b' };
    expect(ExecutionEquivalenceKernel.isSemanticallyEquivalent(a, b)).toBe(true);
  });

  it('isSemanticallyEquivalent false on identity drift', () => {
    const a = baseTrace();
    const b = { ...baseTrace(), model_fingerprint: '2'.repeat(64) };
    expect(ExecutionEquivalenceKernel.isSemanticallyEquivalent(a, b)).toBe(false);
  });

  it('isSemanticallyEquivalent false on route drift', () => {
    const a = baseTrace();
    const b = buildOrchestrationExecutionTraceV1({
      snapshotId: 'snap-eq-1',
      modelFingerprint: '1'.repeat(64),
      selectedExecutionModelVersion: 'v1',
      selectionReason: 'exact_match',
      runtimeHint: 'noise-a',
      route: {
        task_type: 'DATA_LOOKUP',
        route_policy_resolved: 'LEGACY',
        intent_mode_resolved: 'DATA_LOOKUP',
      },
    });
    expect(ExecutionEquivalenceKernel.isSemanticallyEquivalent(a, b)).toBe(false);
  });

  it('stripEquivalenceNoise nulls hint', () => {
    const t = baseTrace();
    expect(stripEquivalenceNoise(t).runtime_hint).toBeNull();
  });
});
