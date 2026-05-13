import type { DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import type { BudgetArbitratorDecisionLogEntry } from './research-team-budget-rollback.util';

/**
 * 将 `research_data.__research_budget_arbitration_decision_log` 映射为编排层 `DecisionLogEntry`，
 * 供 `route_and_run` K3 三处 `decision_log` 对齐（与 `resolveCanonicalDecisionLogForK3` 衔接）。
 */
export function mapBudgetArbitrationEntryToK3DecisionLog(
  entry: BudgetArbitratorDecisionLogEntry,
  requestId: string,
): DecisionLogEntry {
  const pct = (entry.overrun_ratio * 100).toFixed(1);
  return {
    request_id: requestId,
    step: 'RESEARCH',
    actor: 'Orchestrator',
    inputs_summary: `预算超支约 ${pct}%；酒店性价比压力分 ${entry.reroll_pressure_score.toFixed(2)}`,
    outputs_summary: entry.financial_impact
      ? `紧缩重搜后预估酒店成本约 ¥${Math.round(entry.financial_impact.v2_total_estimated_cost)}；较优化前节省约 ¥${Math.round(entry.financial_impact.budget_savings)}`
      : entry.tightened_bucket
        ? `紧缩重搜（austerity）；收紧桶 target=${entry.tightened_bucket.target_amount} hard_limit=${entry.tightened_bucket.hard_limit}`
        : '紧缩重搜（austerity）；无预分桶基准',
    evidence_refs: [],
    timestamp: entry.at,
    metadata: {
      decision_source: entry.source,
      budget_arbitration_scope: entry.scope,
      slot_id: entry.slot_id,
      austerity_mode: entry.austerity_mode,
      overrun_ratio: entry.overrun_ratio,
      reroll_pressure_score: entry.reroll_pressure_score,
      tightened_bucket: entry.tightened_bucket,
      ...(entry.financial_impact ? { financial_impact: entry.financial_impact } : {}),
    },
  };
}

export function extractBudgetArbitrationRawFromResearchData(
  researchData: Record<string, unknown> | undefined,
): BudgetArbitratorDecisionLogEntry[] {
  if (!researchData) return [];
  const raw = researchData.__research_budget_arbitration_decision_log;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is BudgetArbitratorDecisionLogEntry =>
      x !== null &&
      typeof x === 'object' &&
      (x as BudgetArbitratorDecisionLogEntry).source === 'BUDGET_ARBITRATOR_ROLLBACK',
  );
}

/**
 * 向已有 K3 `decision_log` 追加预算仲裁条目（返回同一数组引用，便于就地更新 state）。
 */
export function appendBudgetArbitrationEntriesToDecisionLogInPlace(
  decisionLog: DecisionLogEntry[],
  researchData: Record<string, unknown> | undefined,
  requestId: string,
): void {
  const raw = extractBudgetArbitrationRawFromResearchData(researchData);
  if (!raw.length) return;
  const rid = decisionLog[0]?.request_id?.trim() || requestId;
  for (const e of raw) {
    decisionLog.push(mapBudgetArbitrationEntryToK3DecisionLog(e, rid));
  }
}
