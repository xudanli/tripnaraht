/**
 * Evaluation Harness（scripts 回放 / compare）与 Kernel Harness Runtime（Nest trace）之间的最小关联结构。
 * @see docs/Harness Runtime.md 与 `.cursor/capabilities/harness-runtime/SKILL.md` 中「两层 Harness」说明。
 */
export interface CgusReplayTraceRefV1 {
  caseId: string;
  runId: string;
  traceId: string | null;
  path: string | null;
}

export function buildCgusReplayTraceRefsV1(caseIds: string[], runId: string): CgusReplayTraceRefV1[] {
  const rid = runId.trim();
  return caseIds.map((caseId) => ({
    caseId,
    runId: rid,
    traceId: null,
    path: null,
  }));
}

/** 与 `RouteAndRunResponseDto.observability` 中 harness_* / evaluation_run_id 对齐（snake_case） */
export type HarnessObservabilitySlice = {
  harness_active_trace_id?: string | null;
  harness_trace_export_path?: string | null;
  evaluation_run_id?: string | null;
};

/**
 * 将单次 `route_and_run` 响应里的可观测字段合并为一条 `traceRefs` 记录（供评测脚本聚合报告）。
 */
export function traceRefFromRouteAndRunObservability(
  caseId: string,
  runId: string,
  observability: HarnessObservabilitySlice | null | undefined,
): CgusReplayTraceRefV1 {
  const rid = runId.trim();
  const tid =
    observability?.harness_active_trace_id != null && String(observability.harness_active_trace_id).trim()
      ? String(observability.harness_active_trace_id).trim()
      : null;
  const pth =
    observability?.harness_trace_export_path != null && String(observability.harness_trace_export_path).trim()
      ? String(observability.harness_trace_export_path).trim()
      : null;
  return { caseId, runId: rid, traceId: tid, path: pth };
}
