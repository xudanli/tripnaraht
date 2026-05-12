// src/agent/contracts/execution-normalization-kernel.spec.ts
import { buildOrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import {
  ExecutionNormalizationKernel,
  canonicalExecutionTraceStableJson,
  stripEquivalenceNoise,
} from './execution-normalization-kernel';
import { ExecutionEquivalenceKernel } from './execution-equivalence-kernel';

describe('ExecutionNormalizationKernel', () => {
  it('normalizeExecutionTrace drops runtime path from canonical shape', () => {
    const t = buildOrchestrationExecutionTraceV1({
      snapshotId: '  snap-1  ',
      modelFingerprint: 'Aa' + '0'.repeat(62),
      selectedExecutionModelVersion: ' v1 ',
      selectionReason: 'exact_match',
      runtimeHint: 'any-hint',
      route: {
        task_type: ' GENERIC_QA ',
        route_policy_resolved: ' LEGACY ',
        intent_mode_resolved: ' GENERIC_QA ',
      },
    });
    const c = ExecutionNormalizationKernel.normalizeExecutionTrace(t);
    expect(c.identity.snapshot_key).toBe('snap-1');
    expect(c.identity.model_fingerprint_normalized).toBe('aa' + '0'.repeat(62));
    expect(c.identity.selected_execution_model_version).toBe('v1');
    expect(c.decision.route_decision_path.task_type).toBe('GENERIC_QA');
    expect(c.structure.span_adjacency).toEqual([]);
    const json = canonicalExecutionTraceStableJson(c);
    expect(json).not.toContain('runtime');
  });

  it('stable JSON is invariant under key insertion order in source route object', () => {
    const a = buildOrchestrationExecutionTraceV1({
      snapshotId: 's',
      modelFingerprint: '1'.repeat(64),
      selectedExecutionModelVersion: 'v1',
      selectionReason: 'exact_match',
      runtimeHint: null,
      route: {
        task_type: 'T',
        route_policy_resolved: 'LEGACY',
        intent_mode_requested: undefined,
        intent_mode_resolved: 'T',
      },
    });
    const b = buildOrchestrationExecutionTraceV1({
      snapshotId: 's',
      modelFingerprint: '1'.repeat(64),
      selectedExecutionModelVersion: 'v1',
      selectionReason: 'exact_match',
      runtimeHint: null,
      route: {
        intent_mode_resolved: 'T',
        task_type: 'T',
        route_policy_resolved: 'LEGACY',
      },
    });
    expect(canonicalExecutionTraceStableJson(ExecutionNormalizationKernel.normalizeExecutionTrace(a))).toBe(
      canonicalExecutionTraceStableJson(ExecutionNormalizationKernel.normalizeExecutionTrace(b)),
    );
  });

  it('fingerprint casing normalized → semantic equivalence', () => {
    const lo = buildOrchestrationExecutionTraceV1({
      snapshotId: 's',
      modelFingerprint: 'a'.repeat(64),
      selectedExecutionModelVersion: 'v1',
      selectionReason: 'exact_match',
      runtimeHint: 'x',
      route: { task_type: 'T', route_policy_resolved: 'LEGACY' },
    });
    const up = buildOrchestrationExecutionTraceV1({
      snapshotId: 's',
      modelFingerprint: 'A'.repeat(64),
      selectedExecutionModelVersion: 'v1',
      selectionReason: 'exact_match',
      runtimeHint: 'y',
      route: { task_type: 'T', route_policy_resolved: 'LEGACY' },
    });
    expect(ExecutionEquivalenceKernel.isSemanticallyEquivalent(lo, up)).toBe(true);
  });
});

describe('stripEquivalenceNoise', () => {
  it('nulls runtime_hint on trace', () => {
    const t = buildOrchestrationExecutionTraceV1({
      snapshotId: 's',
      modelFingerprint: '1'.repeat(64),
      selectedExecutionModelVersion: 'v1',
      selectionReason: 'exact_match',
      runtimeHint: 'noise',
      route: { task_type: 'T', route_policy_resolved: 'LEGACY' },
    });
    expect(stripEquivalenceNoise(t).runtime_hint).toBeNull();
  });
});
