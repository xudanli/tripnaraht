// src/agent/contracts/canonical-execution-trace-v1.types.ts
/**
 * §16 trace 的确定性标准形（canonical）；**不**含观测噪声字段。
 * @see semantic-validation-contract.md §22
 */
import type { ExecutionModelRuntimeRouterReason } from '../runtime/execution-model-runtime-router';

export const CANONICAL_EXECUTION_TRACE_V1_SCHEMA_ID = 'agent.orchestration.canonical_execution_trace@v1' as const;
export const CANONICAL_EXECUTION_TRACE_V1_VERSION = 1 as const;

/** 路由键按字典序稳定序列化（值已 trim / optional 已坍缩） */
export type CanonicalRouteDecisionV1 = {
  intent_mode_requested: string | null;
  intent_mode_resolved: string | null;
  route_policy_resolved: string;
  task_type: string;
};

/** 有向边 `(parent → child)`；§16 v1 无 span 时为定长空表 */
export type CanonicalSpanAdjacencyEdgeV1 = Readonly<{
  parent: string;
  child: string;
}>;

export type CanonicalExecutionTraceV1 = Readonly<{
  schemaId: typeof CANONICAL_EXECUTION_TRACE_V1_SCHEMA_ID;
  version: typeof CANONICAL_EXECUTION_TRACE_V1_VERSION;
  identity: Readonly<{
    /** 来源 §16 trace 的 schema（审计对齐；不做版本升级推断） */
    source_execution_trace_schema_id: string;
    source_execution_trace_version: number;
    snapshot_key: string;
    model_fingerprint_normalized: string;
    selected_execution_model_version: string;
  }>;
  decision: Readonly<{
    selection_reason: ExecutionModelRuntimeRouterReason;
    route_decision_path: CanonicalRouteDecisionV1;
  }>;
  structure: Readonly<{
    span_adjacency: readonly CanonicalSpanAdjacencyEdgeV1[];
  }>;
}>;
