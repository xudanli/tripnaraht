// src/agent/contracts/semantic-fixed-point-kernel.spec.ts
import { buildOrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import { ExecutionNormalizationKernel } from './execution-normalization-kernel';
import { SemanticFixedPointKernel } from './semantic-fixed-point-kernel';
import { ExecutionEquivalenceKernel } from './execution-equivalence-kernel';

function trace(hint: string) {
  return buildOrchestrationExecutionTraceV1({
    snapshotId: 's',
    modelFingerprint: '1'.repeat(64),
    selectedExecutionModelVersion: 'v1',
    selectionReason: 'exact_match',
    runtimeHint: hint,
    route: { task_type: 'T', route_policy_resolved: 'LEGACY' },
  });
}

describe('SemanticFixedPointKernel', () => {
  it('isFixedPointCanonical true iff stable JSON matches', () => {
    const t = trace('a');
    const c1 = ExecutionNormalizationKernel.normalizeExecutionTrace(t);
    const c2 = ExecutionNormalizationKernel.normalizeExecutionTrace({ ...t, runtime_hint: 'b' });
    expect(SemanticFixedPointKernel.isFixedPointCanonical(c1, c2)).toBe(true);
  });

  it('isFixedPointTraces false when route differs', () => {
    const a = trace('x');
    const b = buildOrchestrationExecutionTraceV1({
      snapshotId: 's',
      modelFingerprint: '1'.repeat(64),
      selectedExecutionModelVersion: 'v1',
      selectionReason: 'exact_match',
      runtimeHint: 'y',
      route: { task_type: 'OTHER', route_policy_resolved: 'LEGACY' },
    });
    expect(SemanticFixedPointKernel.isFixedPointTraces(a, b)).toBe(false);
  });

  it('isFixedPointTraces aligns with semantic equivalence (v1)', () => {
    const a = trace('p');
    const b = trace('q');
    expect(SemanticFixedPointKernel.isFixedPointTraces(a, b)).toBe(ExecutionEquivalenceKernel.isSemanticallyEquivalent(a, b));
  });
});
