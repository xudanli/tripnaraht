// src/agent/contracts/execution-model-stability.spec.ts
import { buildOrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import { canonicalExecutionTraceStableJson, ExecutionNormalizationKernel } from './execution-normalization-kernel';
import { ExecutionModelStability } from './execution-model-stability';

function t(hint: string) {
  return buildOrchestrationExecutionTraceV1({
    snapshotId: 's',
    modelFingerprint: '1'.repeat(64),
    selectedExecutionModelVersion: 'v1',
    selectionReason: 'exact_match',
    runtimeHint: hint,
    route: { task_type: 'T', route_policy_resolved: 'LEGACY' },
  });
}

describe('ExecutionModelStability', () => {
  it('admit_schema true for valid trace', () => {
    expect(ExecutionModelStability.isStableV1({ trace: t('x'), tier: 'admit_schema' })).toBe(true);
  });

  it('pinned_canonical requires match', () => {
    const trace = t('a');
    const pin = canonicalExecutionTraceStableJson(ExecutionNormalizationKernel.normalizeExecutionTrace(t('b')));
    expect(ExecutionModelStability.isStableV1({ trace, tier: 'pinned_canonical', expectedCanonicalStableJson: pin })).toBe(true);
    expect(
      ExecutionModelStability.isStableV1({
        trace: buildOrchestrationExecutionTraceV1({
          snapshotId: 'other',
          modelFingerprint: '1'.repeat(64),
          selectedExecutionModelVersion: 'v1',
          selectionReason: 'exact_match',
          runtimeHint: 'a',
          route: { task_type: 'T', route_policy_resolved: 'LEGACY' },
        }),
        tier: 'pinned_canonical',
        expectedCanonicalStableJson: pin,
      }),
    ).toBe(false);
  });

  it('pinned_canonical false when pin empty', () => {
    expect(ExecutionModelStability.isStableV1({ trace: t('a'), tier: 'pinned_canonical', expectedCanonicalStableJson: '' })).toBe(false);
  });

  it('isReplaySemanticallyFaithfulV1 ignores runtime_hint', () => {
    expect(ExecutionModelStability.isReplaySemanticallyFaithfulV1(t('1'), t('2'))).toBe(true);
  });
});
