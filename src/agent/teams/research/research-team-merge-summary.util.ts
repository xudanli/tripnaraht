import type { ResearchContextMergeManifest } from './research-context.types';
import type { AccumulatedResearchFinancialReport, BudgetShadowAlert } from './research-team-budget-ledger.util';

/** 与 Harness / BFF 对齐的合并审计摘要（轻量，不含完整 diff）。 */
export type TeamMergeSummary = {
  merge_strategy: 'DIFF_BASED_CLONE_MERGE';
  total_keys_touched: number;
  scope_mutations: Record<
    string,
    {
      updated_keys: string[];
      evidence_added_count: number;
    }
  >;
  /** prior 缝合降级次数（韧性 / Provider 健康观测） */
  fallback_suture_count: number;
  /** 5.0：Member `financials` 聚合后的预估总成本（仅含已回传行） */
  total_estimated_cost?: number;
  /** 5.0：行程总预算（与 Leader 预分桶同源） */
  total_trip_budget?: number;
  /** 5.0：桶级负载 Σ(est/target)，用于解释「域叠加超支」叙事 */
  load_factor_vs_bucket?: number;
  /** 5.0：财务行明细（审计） */
  financial_lines?: AccumulatedResearchFinancialReport['lines'];
  /** 5.0：影子仲裁（如 `BUDGET_OVERRUN_ALERT`） */
  budget_shadow_alerts?: readonly BudgetShadowAlert[];
};

const MEMBER_SOURCE_TO_SCOPE: Record<string, string> = {
  DestinationResearchMember: 'destination',
  HotelResearchMember: 'hotel',
  FlightResearchMember: 'flight',
  TransportResearchMember: 'transport',
  ComplianceResearchMember: 'compliance',
  FALLBACK_SUTURE: 'suture',
  BUDGET_ARBITRATOR_ROLLBACK: 'hotel',
};

function emptySummary(): TeamMergeSummary {
  return {
    merge_strategy: 'DIFF_BASED_CLONE_MERGE',
    total_keys_touched: 0,
    scope_mutations: {},
    fallback_suture_count: 0,
  };
}

/**
 * 将 `ResearchContextManager` 产出的 merge manifest 压成按「资产域」聚合的审计摘要。
 * `financial`：5.0 总账与影子仲裁（与 merge manifest 正交，由 Pipeline 写入 workspace 后传入）。
 */
export function buildTeamMergeSummary(
  log: readonly ResearchContextMergeManifest[] | undefined,
  financial?: Readonly<{
    globalReport?: AccumulatedResearchFinancialReport;
    budgetShadowAlerts?: readonly BudgetShadowAlert[];
  }>,
): TeamMergeSummary {
  const base: TeamMergeSummary = !log?.length
    ? emptySummary()
    : (() => {
        const scopeMutations: TeamMergeSummary['scope_mutations'] = {};
        const uniqueKeys = new Set<string>();
        let fallbackSutureCount = 0;

        for (const m of log) {
          if (m.attribution === 'FALLBACK_SUTURE' || m.source === 'FALLBACK_SUTURE') {
            fallbackSutureCount += 1;
          }
          const scope = MEMBER_SOURCE_TO_SCOPE[m.source] ?? 'other';
          if (!scopeMutations[scope]) {
            scopeMutations[scope] = { updated_keys: [], evidence_added_count: 0 };
          }
          const bucket = scopeMutations[scope];
          for (const k of m.keysTouched) {
            uniqueKeys.add(k);
            if (!bucket.updated_keys.includes(k)) {
              bucket.updated_keys.push(k);
            }
          }
          bucket.evidence_added_count += m.evidenceRefsAppended;
        }

        for (const k of Object.keys(scopeMutations)) {
          scopeMutations[k].updated_keys.sort();
        }

        return {
          merge_strategy: 'DIFF_BASED_CLONE_MERGE',
          total_keys_touched: uniqueKeys.size,
          scope_mutations: scopeMutations,
          fallback_suture_count: fallbackSutureCount,
        };
      })();

  const gr = financial?.globalReport;
  const alerts = financial?.budgetShadowAlerts;
  if (!gr && !alerts?.length) return base;

  return {
    ...base,
    ...(gr
      ? {
          total_estimated_cost: gr.total_estimated_cost,
          total_trip_budget: gr.total_user_budget,
          financial_lines: gr.lines,
          ...(gr.load_factor_vs_bucket !== undefined ? { load_factor_vs_bucket: gr.load_factor_vs_bucket } : {}),
        }
      : {}),
    ...(alerts?.length ? { budget_shadow_alerts: alerts } : {}),
  };
}
