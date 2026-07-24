/**
 * 决策闭环 L1 UI 辅助（与 docs/frontend-decision-closure-integration.md 对齐）。
 * 前端仓可复制；后端用于契约测试与 mock 校验。
 */

export interface DecisionClosureWorldMaterialization {
  applied_events?: number;
  road_ids?: string[];
  weather_dates?: string[];
  store_version?: number;
}

export interface DecisionClosureL1Explain {
  decision_verdict_narration_zh?: string;
  meta_decision_audit?: string;
  world_constraint_materialization?: DecisionClosureWorldMaterialization;
  recommended_alternative_id?: string;
  decision_verdict?: { chosen_plan_id?: string };
  alternatives?: Array<{ id: string; score?: number }>;
}

export function resolveChosenAlternativeId(
  opt?: DecisionClosureL1Explain | null,
): string {
  if (!opt) return '';
  return (
    opt.decision_verdict?.chosen_plan_id?.trim() ||
    opt.recommended_alternative_id?.trim() ||
    ''
  );
}

export function hasAlternativesRows(
  alternatives?: Array<unknown> | null,
): boolean {
  return (alternatives?.length ?? 0) > 0;
}

/** 按 score 降序；无 score 的排后 */
export function sortAlternativesForDisplay<
  T extends { id: string; score?: number; expected_utility?: number },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const sa = a.score ?? a.expected_utility ?? -1;
    const sb = b.score ?? b.expected_utility ?? -1;
    return sb - sa;
  });
}

export function formatRejectedPlanStatus(status: string): string {
  const map: Record<string, string> = {
    infeasible: '不可行',
    rejected: '已弃选',
    chosen: '已选用',
  };
  return map[status] ?? status;
}

export function formatScorePct(score?: number): string {
  if (score == null || !Number.isFinite(score)) return '—';
  return `${Math.round(score * 1000) / 10}%`;
}

export function shouldShowRoadBanner(
  wm?: DecisionClosureWorldMaterialization | null,
): boolean {
  if (!wm) return false;
  if ((wm.applied_events ?? 0) === 0) return false;
  return (wm.road_ids?.length ?? 0) > 0 || (wm.weather_dates?.length ?? 0) > 0;
}

export function roadBannerText(wm: DecisionClosureWorldMaterialization): string {
  const roads = wm.road_ids?.length ? wm.road_ids.join('、') : '—';
  const dates = wm.weather_dates?.length ? wm.weather_dates.join('、') : '—';
  return `已纳入 ${wm.applied_events ?? 0} 条路况/公告约束（道路：${roads}；天气日：${dates}）`;
}

export function hasDecisionVerdictCard(opt?: DecisionClosureL1Explain | null): boolean {
  return !!opt?.decision_verdict_narration_zh?.trim();
}

export function hasRejectedPlansRows(
  verdict?: { rejected_plans?: unknown[] } | null,
): boolean {
  return (verdict?.rejected_plans?.length ?? 0) > 0;
}
