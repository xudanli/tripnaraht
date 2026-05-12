// src/agent/contracts/orchestration-execution-trace-v1.spec.ts
import {
  buildOrchestrationExecutionTraceV1,
  ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID,
  ORCHESTRATION_EXECUTION_TRACE_V1_VERSION,
} from './orchestration-execution-trace-v1.types';

describe('OrchestrationExecutionTraceV1', () => {
  it('buildOrchestrationExecutionTraceV1 returns versioned ABI slice', () => {
    const fp = 'a'.repeat(64);
    const t = buildOrchestrationExecutionTraceV1({
      snapshotId: 'snap-1',
      modelFingerprint: fp,
      selectedExecutionModelVersion: 'v1',
      selectionReason: 'exact_match',
      runtimeHint: null,
      route: {
        task_type: 'GENERIC_QA',
        route_policy_resolved: 'CLAUDE_SM',
        intent_mode_requested: 'AUTO',
        intent_mode_resolved: 'GENERIC_QA',
      },
    });
    expect(t.schemaId).toBe(ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID);
    expect(t.version).toBe(ORCHESTRATION_EXECUTION_TRACE_V1_VERSION);
    expect(t.model_fingerprint).toBe(fp);
    expect(t.selection_reason).toBe('exact_match');
    expect(t.route_decision_path.route_policy_resolved).toBe('CLAUDE_SM');
  });
});
