import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';
import type {
  ResearchBudgetBucket,
  ResearchBudgetBucketsMap,
  ResearchFinancials,
} from './research-team-bus.types';

export type FinancialFeedbackLine = Readonly<{
  slot_id?: string;
  financials: ResearchFinancials;
}>;

export type BudgetShadowAlert = Readonly<{
  code: 'BUDGET_OVERRUN_ALERT';
  total_user_budget: number;
  total_estimated_cost: number;
  overrun_amount: number;
  overrun_ratio: number;
  /** `estimated_cost * marginal_utility` 降序：高压力域更易「解释」超支 */
  high_marginal_utility_contributors: ReadonlyArray<{
    scope: ResearchFinancials['scope'];
    slot_id?: string;
    pressure_score: number;
    estimated_cost: number;
    marginal_utility: number;
  }>;
}>;

export type AccumulatedResearchFinancialReport = Readonly<{
  lines: ReadonlyArray<
    Readonly<{
      scope: ResearchFinancials['scope'];
      slot_id?: string;
      estimated_cost: number;
      marginal_utility: number;
    }>
  >;
  total_estimated_cost: number;
  total_user_budget?: number;
  /** Σ(estimated_cost / target_amount)（仅对能绑定桶的行）；>1 表示桶级负载叠加 */
  load_factor_vs_bucket?: number;
  /** 5.1：仲裁紧缩重跑前一次聚账的 total（仅当完成二次聚账时存在） */
  prior_total_estimated_cost?: number;
  /** 5.1：V1.total − V2.total（酒店重搜后非负） */
  budget_aggregate_savings?: number;
}>;

function finitePositive(n: unknown): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/**
 * 从 trip 载荷解析总预算（与 BFF / LLM 常见字段对齐）。
 */
export function extractTripTotalBudget(trip: Record<string, unknown> | null | undefined): number | undefined {
  if (!trip || typeof trip !== 'object') return undefined;
  const direct = finitePositive(trip.totalBudget) ?? finitePositive(trip.total_budget);
  if (direct !== undefined) return direct;
  const b = trip.budget;
  if (b && typeof b === 'object') {
    const bo = b as Record<string, unknown>;
    const fromB = finitePositive(bo.total) ?? finitePositive(bo.amount);
    if (fromB !== undefined) return fromB;
  }
  const c = trip.constraints;
  if (c && typeof c === 'object') {
    const bud = (c as Record<string, unknown>).budget;
    if (bud && typeof bud === 'object') {
      const fromC = finitePositive((bud as Record<string, unknown>).total);
      if (fromC !== undefined) return fromC;
    }
  }
  return undefined;
}

const BASE_WEIGHTS: Record<ResearchFinancials['scope'], number> = {
  hotel: 0.34,
  flight: 0.26,
  destination: 0.12,
  transport: 0.18,
  compliance: 0.1,
};

const ALL_SCOPES: readonly ResearchFinancials['scope'][] = [
  'hotel',
  'flight',
  'destination',
  'transport',
  'compliance',
];

/**
 * 将总预算切成各域 `ResearchBudgetBucket`：默认比例贴近 `CostAgentService.optimizeBudget` 住宿/交通权重，
 * 并用 4.0 `compliance_experience_axis` / `price_sensitivity_proxy` 做小幅再平衡。
 */
export function buildResearchBudgetBucketsFromTotal(
  totalBudget: number,
  profile?: UserCognitiveProfile,
): ResearchBudgetBucketsMap {
  if (!Number.isFinite(totalBudget) || totalBudget <= 0) return {};

  const w: Record<ResearchFinancials['scope'], number> = { ...BASE_WEIGHTS };
  const axis = profile?.compliance_experience_axis ?? 0;
  const shift = Math.max(-0.06, Math.min(0.06, axis * 0.08));
  w.hotel = Math.max(0.05, w.hotel - shift);
  w.compliance = Math.max(0.03, w.compliance + shift);
  const sumW = ALL_SCOPES.reduce((a, k) => a + w[k], 0);
  for (const k of ALL_SCOPES) {
    w[k] /= sumW;
  }

  const ps = profile?.price_sensitivity_proxy ?? 0;
  if (ps > 0.35) {
    const damp = Math.max(0.85, Math.min(1, 1 - 0.12 * (ps - 0.35)));
    w.hotel *= damp;
    w.flight *= damp;
    const s2 = ALL_SCOPES.reduce((a, k) => a + w[k], 0);
    for (const k of ALL_SCOPES) {
      w[k] /= s2;
    }
  }

  const tb = Math.round(totalBudget);
  const targets = ALL_SCOPES.map((scope) => ({
    scope,
    target: Math.round(tb * w[scope]),
  }));
  let tSum = targets.reduce((a, x) => a + x.target, 0);
  const diff = tb - tSum;
  if (diff !== 0 && targets.length) {
    const idx = targets.reduce((best, cur, i) => (cur.target > targets[best]!.target ? i : best), 0);
    targets[idx]!.target = Math.max(0, targets[idx]!.target + diff);
  }

  const out: Partial<Record<ResearchFinancials['scope'], ResearchBudgetBucket>> = {};
  for (const { scope, target } of targets) {
    if (target <= 0) continue;
    out[scope] = {
      target_amount: target,
      hard_limit: Math.round(target * 1.25),
    };
  }
  return out as ResearchBudgetBucketsMap;
}

/**
 * 聚合 Member `financials` 并运行影子仲裁（超支告警，不回滚）。
 */
export function accumulateResearchFinancialReport(
  feedback: readonly FinancialFeedbackLine[],
  opts?: Readonly<{ total_user_budget?: number; buckets?: ResearchBudgetBucketsMap }>,
): { report: AccumulatedResearchFinancialReport; alerts: readonly BudgetShadowAlert[] } {
  const lines = feedback.map((f) => ({
    scope: f.financials.scope,
    slot_id: f.slot_id,
    estimated_cost: f.financials.estimated_cost,
    marginal_utility: f.financials.marginal_utility,
  }));
  const total_estimated_cost = lines.reduce((a, l) => a + l.estimated_cost, 0);

  let load_factor_vs_bucket: number | undefined;
  if (opts?.buckets && lines.length) {
    let sum = 0;
    for (const l of lines) {
      const tgt = opts.buckets[l.scope]?.target_amount;
      if (tgt && tgt > 0) sum += l.estimated_cost / tgt;
    }
    if (sum > 0) load_factor_vs_bucket = sum;
  }

  const report: AccumulatedResearchFinancialReport = {
    lines,
    total_estimated_cost,
    ...(opts?.total_user_budget !== undefined ? { total_user_budget: opts.total_user_budget } : {}),
    ...(load_factor_vs_bucket !== undefined ? { load_factor_vs_bucket } : {}),
  };

  const alerts: BudgetShadowAlert[] = [];
  const tub = opts?.total_user_budget;
  if (tub !== undefined && tub > 0 && total_estimated_cost > tub) {
    const overrun_amount = total_estimated_cost - tub;
    const high_marginal_utility_contributors = [...lines]
      .map((l) => ({
        scope: l.scope,
        slot_id: l.slot_id,
        pressure_score: l.estimated_cost * l.marginal_utility,
        estimated_cost: l.estimated_cost,
        marginal_utility: l.marginal_utility,
      }))
      .sort((a, b) => b.pressure_score - a.pressure_score);
    alerts.push({
      code: 'BUDGET_OVERRUN_ALERT',
      total_user_budget: tub,
      total_estimated_cost,
      overrun_amount,
      overrun_ratio: overrun_amount / tub,
      high_marginal_utility_contributors,
    });
  }

  return { report, alerts };
}
