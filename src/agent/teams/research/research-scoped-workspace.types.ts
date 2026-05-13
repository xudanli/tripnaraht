import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { ResearchAssetScope } from '../../utils/research-asset-scope.util';
import type { ResearchContextMergeManifest } from './research-context.types';
import type { ResearchBudgetBucketsMap } from './research-team-bus.types';
import type { AccumulatedResearchFinancialReport, BudgetShadowAlert } from './research-team-budget-ledger.util';

/**
 * Leader / `execute` 共用：prepare 阶段产出；finalize 与 Member 编排消费。
 */
export type LeaderResearchWorkspace = {
  researchData: Record<string, unknown>;
  evidenceRefs: string[];
  /** 无 trip 时 Member 跳过，finalize 仍可用 `ctx.tripPlanRequest` 兜底 */
  effectiveTrip?: PhaseExecutorContext['tripPlanRequest'];
  effectiveMode: 'full' | 'transport_only' | 'scoped_partial';
  /** `scoped_partial` 下传入 `buildTopologyPlan`；full / transport_only 为空 */
  scopesForTopology: ResearchAssetScope[];
  /** `ResearchContextManager` 合并摘要（拓扑执行后由 Executor 写入，可选） */
  researchContextMergeLog?: readonly ResearchContextMergeManifest[];
  /** 5.0：从 trip 解析的总预算（与 `researchBudgetBuckets` 同源） */
  researchTripTotalBudget?: number;
  /** 5.0：Leader 预分桶，供总线 Assignment 注入 `budgetBucket` */
  researchBudgetBuckets?: ResearchBudgetBucketsMap;
  /** 5.0：拓扑完成后由 Pipeline 聚合 Member `financials` */
  globalFinancialReport?: AccumulatedResearchFinancialReport;
  /** 5.0：影子仲裁审计（不写回滚，仅观测） */
  budgetShadowAlerts?: readonly BudgetShadowAlert[];
  /** 5.0.1：超支达阈值且已尝试预算驱动重跑时为 true */
  budgetRerunRequired?: boolean;
  /** 6.3：本轮 Leader 管线内已成功完成的「实时重跑」次数（与 `research_data.__research_realtime_reroll_count` 对齐） */
  realtimeRerollCount?: number;
};

/** @deprecated 使用 LeaderResearchWorkspace */
export type ScopedCommerceTransportWorkspace = LeaderResearchWorkspace;
