import type { AccumulatedResearchFinancialReport, BudgetShadowAlert } from './research-team-budget-ledger.util';

/** 供 BFF / Kernel 升格进 `decision_log` 的结构化条目（与 RLHF 主路径解耦）。 */
export type BudgetArbitratorDecisionLogEntry = Readonly<{
  source: 'BUDGET_ARBITRATOR_ROLLBACK';
  scope: 'hotel';
  at: string;
  overrun_ratio: number;
  /** 重跑目标：性价比最差（cost / (marginal_utility + ε) 最大） */
  reroll_pressure_score: number;
  slot_id?: string;
  austerity_mode: true;
  tightened_bucket?: Readonly<{ target_amount: number; hard_limit: number }>;
  /** 5.1：二次聚账后的节省（元或与上游一致） */
  financial_impact?: Readonly<{
    budget_savings: number;
    v1_total_estimated_cost: number;
    v2_total_estimated_cost: number;
  }>;
}>;

/**
 * 在已存在 `BUDGET_OVERRUN_ALERT` 时，总超支比例达到阈值则触发「预算驱动重跑」。
 */
export function shouldTriggerBudgetRollback(
  alerts: readonly BudgetShadowAlert[] | undefined,
  overrunRatioThreshold: number,
): boolean {
  if (!alerts?.length) return false;
  const a = alerts.find((x) => x.code === 'BUDGET_OVERRUN_ALERT');
  if (!a) return false;
  return a.overrun_ratio >= overrunRatioThreshold;
}

/**
 * 选择降级重跑目标：在财务行中找「成本高但边际效用低」的域（性价比压力最大）。
 */
export function pickBudgetRerollTargetFromReport(
  report: AccumulatedResearchFinancialReport | undefined,
): Readonly<{ scope: 'hotel' | 'flight' | 'transport' | 'destination' | 'compliance'; slot_id?: string; pressure_score: number }> | undefined {
  const lines = report?.lines;
  if (!lines?.length) return undefined;
  let best: { scope: (typeof lines)[0]['scope']; slot_id?: string; pressure_score: number } | undefined;
  for (const l of lines) {
    const pressure = l.estimated_cost / (l.marginal_utility + 0.05);
    if (!best || pressure > best.pressure_score) {
      best = { scope: l.scope, slot_id: l.slot_id, pressure_score: pressure };
    }
  }
  return best;
}
