import type { GovernancePolicyMode } from './governance-policy.types';

export interface AllocationOutcome {
  resourceId: string;
  slotKey?: string;
  winnerTripId: string;
  reason: string;
  policyApplied: GovernancePolicyMode;
  rejected: Array<{
    tripId: string;
    /** 对失败方的治理建议：改时段 / 换资源 */
    compensation: string;
  }>;
}

export interface GovernanceTickResult {
  outcomes: AllocationOutcome[];
  /** 资源层负载更新快照（仅内存骨架） */
  resourceSnapshots: Record<string, { capacity: number; currentLoad: number }>;
}
