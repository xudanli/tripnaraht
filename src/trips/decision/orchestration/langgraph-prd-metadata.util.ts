/**
 * LangGraph `metadata` 与 Orchestrator `request_id` / `plan_version`（PRD 追溯）对齐。
 * 供 Agent 层与 trips 编排层共用，避免 trips → agent 反向依赖。
 */

import type { LangGraphState } from './langgraph-orchestrator.interface';

/**
 * 合并 / 规范化写入 LangGraphState.metadata（双写 camelCase + snake_case）。
 */
export function mergePrdTraceIntoLangGraphMetadata(
  context?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (context === undefined || context === null) return undefined;
  const out: Record<string, unknown> = { ...context };
  const rid =
    (typeof out.requestId === 'string' && out.requestId.trim() ? out.requestId : undefined) ||
    (typeof out.request_id === 'string' && out.request_id.trim() ? out.request_id : undefined);
  let pv: number | undefined;
  if (typeof out.planVersion === 'number' && Number.isFinite(out.planVersion)) {
    pv = out.planVersion;
  } else if (typeof out.plan_version === 'number' && Number.isFinite(out.plan_version)) {
    pv = out.plan_version;
  }
  if (rid) {
    out.requestId = rid;
    out.request_id = rid;
  }
  if (pv !== undefined) {
    out.planVersion = pv;
    out.plan_version = pv;
  }
  return out;
}

/** 供 writeBackFromNode：从 state.metadata 取追溯字段 */
export function extractPrdWriteBackTraceFromLangGraphState(
  state: LangGraphState,
): { requestId?: string; planVersion?: number } {
  const m = state.metadata;
  if (!m || typeof m !== 'object') return {};
  const requestId =
    (typeof m.requestId === 'string' && m.requestId.trim() ? m.requestId : undefined) ||
    (typeof m.request_id === 'string' && m.request_id.trim() ? m.request_id : undefined);
  let planVersion: number | undefined;
  if (typeof m.planVersion === 'number' && Number.isFinite(m.planVersion)) {
    planVersion = m.planVersion;
  } else if (typeof m.plan_version === 'number' && Number.isFinite(m.plan_version)) {
    planVersion = m.plan_version;
  }
  return { requestId, planVersion };
}
