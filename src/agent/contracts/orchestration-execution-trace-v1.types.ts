// src/agent/contracts/orchestration-execution-trace-v1.types.ts
/**
 * route_and_run 主链正式执行轨迹切片（v1）：可序列化、可索引；与 ETK `ExecutionTrace` 正交（非 ECPS 步进）。
 * @see semantic-validation-contract.md §16
 */
import type { ExecutionModelRuntimeRouterReason } from '../runtime/execution-model-runtime-router';

export const ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID = 'agent.orchestration.execution_trace@v1' as const;
export const ORCHESTRATION_EXECUTION_TRACE_V1_VERSION = 1 as const;

/** 与 `traceInfo.route_decision` 对齐的稳定路由事实（执行前快照） */
export type ExecutionTraceV1RouteDecisionPath = {
  task_type: string;
  route_policy_resolved: string;
  intent_mode_requested?: string;
  intent_mode_resolved?: string;
};

export type OrchestrationExecutionTraceV1 = {
  schemaId: typeof ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID;
  version: typeof ORCHESTRATION_EXECUTION_TRACE_V1_VERSION;
  snapshot_id: string;
  /** 当前宿主语义执行模型指纹（§10 material；与 ledger export 同源算法） */
  model_fingerprint: string;
  selected_execution_model_version: string;
  selection_reason: ExecutionModelRuntimeRouterReason;
  runtime_hint: string | null;
  route_decision_path: ExecutionTraceV1RouteDecisionPath;
};

/** 文档与观测中的「ExecutionTraceV1」即 `OrchestrationExecutionTraceV1`（与 ETK `ExecutionTrace` 区分） */
export type ExecutionTraceV1 = OrchestrationExecutionTraceV1;

export function buildOrchestrationExecutionTraceV1(params: {
  snapshotId: string;
  modelFingerprint: string;
  selectedExecutionModelVersion: string;
  selectionReason: ExecutionModelRuntimeRouterReason;
  runtimeHint: string | null;
  route: ExecutionTraceV1RouteDecisionPath;
}): OrchestrationExecutionTraceV1 {
  return {
    schemaId: ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID,
    version: ORCHESTRATION_EXECUTION_TRACE_V1_VERSION,
    snapshot_id: params.snapshotId,
    model_fingerprint: params.modelFingerprint,
    selected_execution_model_version: params.selectedExecutionModelVersion,
    selection_reason: params.selectionReason,
    runtime_hint: params.runtimeHint,
    route_decision_path: { ...params.route },
  };
}
