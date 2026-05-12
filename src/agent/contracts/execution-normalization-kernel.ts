// src/agent/contracts/execution-normalization-kernel.ts
/**
 * 语义执行轨迹标准形（pure projection）；normalize ≠ enrich。
 * @see semantic-validation-contract.md §22
 */
import { sortKeysDeep } from '../runtime/execution-timeline-hash.util';
import type { ExecutionTraceV1RouteDecisionPath } from './orchestration-execution-trace-v1.types';
import {
  ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID,
  ORCHESTRATION_EXECUTION_TRACE_V1_VERSION,
  type OrchestrationExecutionTraceV1,
} from './orchestration-execution-trace-v1.types';
import {
  CANONICAL_EXECUTION_TRACE_V1_SCHEMA_ID,
  CANONICAL_EXECUTION_TRACE_V1_VERSION,
  type CanonicalExecutionTraceV1,
  type CanonicalRouteDecisionV1,
} from './canonical-execution-trace-v1.types';

function trimSnapshotKey(snapshotId: string): string {
  return snapshotId.trim();
}

/** 指纹：仅大小写/空白规范化（不重算哈希、不猜测缺失位） */
function normalizeModelFingerprintHex(fp: string): string {
  return fp.trim().toLowerCase();
}

function normalizeSelectedExecutionModelVersion(v: string): string {
  return v.trim();
}

function optIntentField(s: string | undefined): string | null {
  if (s === undefined) return null;
  const t = s.trim();
  return t === '' ? null : t;
}

function canonicalRouteDecisionPath(r: ExecutionTraceV1RouteDecisionPath): CanonicalRouteDecisionV1 {
  return {
    intent_mode_requested: optIntentField(r.intent_mode_requested),
    intent_mode_resolved: optIntentField(r.intent_mode_resolved),
    route_policy_resolved: r.route_policy_resolved.trim(),
    task_type: r.task_type.trim(),
  };
}

/** §21：等价判定侧使用的 hint 剥离（不改变 route / identity） */
export function stripEquivalenceNoise(trace: OrchestrationExecutionTraceV1): OrchestrationExecutionTraceV1 {
  return { ...trace, runtime_hint: null };
}

export function canonicalExecutionTraceStableJson(c: CanonicalExecutionTraceV1): string {
  return JSON.stringify(sortKeysDeep(c));
}

export const ExecutionNormalizationKernel = {
  /**
   * 将 §16 trace 投影为 canonical：**剔除** runtime_hint / 时间戳 / 日志（v1 trace 未载字段则无操作）。
   * **禁止：** 补全缺失节点、猜测 intent、runtime / IO。
   */
  normalizeExecutionTrace(trace: OrchestrationExecutionTraceV1): CanonicalExecutionTraceV1 {
    const route = canonicalRouteDecisionPath(trace.route_decision_path);
    return {
      schemaId: CANONICAL_EXECUTION_TRACE_V1_SCHEMA_ID,
      version: CANONICAL_EXECUTION_TRACE_V1_VERSION,
      identity: {
        source_execution_trace_schema_id: trace.schemaId,
        source_execution_trace_version: trace.version,
        snapshot_key: trimSnapshotKey(trace.snapshot_id),
        model_fingerprint_normalized: normalizeModelFingerprintHex(trace.model_fingerprint),
        selected_execution_model_version: normalizeSelectedExecutionModelVersion(trace.selected_execution_model_version),
      },
      decision: {
        selection_reason: trace.selection_reason,
        route_decision_path: route,
      },
      structure: {
        span_adjacency: [],
      },
    };
  },
};

/** 合法 §16 schema 的便捷守卫（与 §21 对齐） */
export function isOrchestrationExecutionTraceV1Schema(trace: OrchestrationExecutionTraceV1): boolean {
  return trace.schemaId === ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID && trace.version === ORCHESTRATION_EXECUTION_TRACE_V1_VERSION;
}
