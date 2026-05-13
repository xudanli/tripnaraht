import type { DecisionLedgerSnapshot } from './decision-ledger.types';
import type { LedgerRecomputeExecutorResultV1 } from './ledger-recompute.types';

export interface LedgerAuditImpactMetricsV1 {
  invalidatedCount: number;
  staleCount: number;
}

/** MCP / API 世界切片刷新后的审计与重算计划（观测闭包）。 */
export interface LedgerAuditReportV1 {
  revision: 'v1';
  hasDrift: boolean;
  updatedLedger: DecisionLedgerSnapshot;
  executionPlan: LedgerRecomputeExecutorResultV1;
  impactMetrics: LedgerAuditImpactMetricsV1;
}
