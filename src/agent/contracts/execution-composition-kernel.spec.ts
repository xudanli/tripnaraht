// src/agent/contracts/execution-composition-kernel.spec.ts
import { buildOrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import { ExecutionCompositionKernel } from './execution-composition-kernel';
import { SemanticFixedPointKernel } from './semantic-fixed-point-kernel';

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

describe('ExecutionCompositionKernel', () => {
  it('conflictFreeMerge null when not equivalent', () => {
    const a = trace('a');
    const b = buildOrchestrationExecutionTraceV1({
      snapshotId: 'other',
      modelFingerprint: '1'.repeat(64),
      selectedExecutionModelVersion: 'v1',
      selectionReason: 'exact_match',
      runtimeHint: 'b',
      route: { task_type: 'T', route_policy_resolved: 'LEGACY' },
    });
    expect(ExecutionCompositionKernel.conflictFreeMerge(a, b)).toBeNull();
  });

  it('conflictFreeMerge returns left when A ~ B', () => {
    const a = trace('x');
    const b = trace('y');
    expect(ExecutionCompositionKernel.conflictFreeMerge(a, b)).toBe(a);
  });

  it('congruence: A~A\' and B~B\' and A~B implies merge(A,B) ~ merge(A\',B\')', () => {
    const a = trace('1');
    const b = trace('2');
    const ap = { ...a, runtime_hint: '3' as const };
    const bp = { ...b, runtime_hint: '4' as const };
    expect(SemanticFixedPointKernel.isFixedPointTraces(a, ap)).toBe(true);
    expect(SemanticFixedPointKernel.isFixedPointTraces(b, bp)).toBe(true);
    const m1 = ExecutionCompositionKernel.conflictFreeMerge(a, b)!;
    const m2 = ExecutionCompositionKernel.conflictFreeMerge(ap, bp)!;
    expect(SemanticFixedPointKernel.isFixedPointTraces(m1, m2)).toBe(true);
  });

  it('associativity on same equivalence class (v1)', () => {
    const a = trace('a');
    const b = trace('b');
    const c = trace('c');
    const m1 = ExecutionCompositionKernel.compose(ExecutionCompositionKernel.compose(a, b)!, c)!;
    const m2 = ExecutionCompositionKernel.compose(a, ExecutionCompositionKernel.compose(b, c)!)!;
    expect(SemanticFixedPointKernel.isFixedPointTraces(m1, m2)).toBe(true);
    expect(m1).toBe(a);
    expect(m2).toBe(a);
  });

  it('sequentialCompose and overlayCompose undefined in v1', () => {
    expect(ExecutionCompositionKernel.sequentialCompose(trace('a'), trace('b'))).toBeNull();
    expect(ExecutionCompositionKernel.overlayCompose(trace('a'), trace('b'))).toBeNull();
  });
});
