import type { ActiveRisk } from '../types/execution-risk.types';
import type { RiskRefreshTriggerType } from '../../../generated/execution-risk-contracts';

export const EXECUTION_RISK_ACTIVE_SNAPSHOT_KEY = 'executionRiskActiveSnapshot';

export interface ExecutionRiskActiveSnapshot {
  snapshotId: string;
  tripId: string;
  planVersionId: string;
  refreshedAt: string;
  triggerType: RiskRefreshTriggerType;
  triggerRef?: string;
  activeRiskCount: number;
  clusterCount: number;
  activeRisks: ActiveRisk[];
}

export function readExecutionRiskActiveSnapshot(
  metadata: Record<string, unknown> | null | undefined,
): ExecutionRiskActiveSnapshot | null {
  const block = metadata?.[EXECUTION_RISK_ACTIVE_SNAPSHOT_KEY];
  if (!block || typeof block !== 'object') return null;
  return block as ExecutionRiskActiveSnapshot;
}
