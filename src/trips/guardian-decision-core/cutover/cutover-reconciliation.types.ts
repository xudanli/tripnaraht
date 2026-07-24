/**
 * Cutover reconciliation on RFC001 ledger records — runtime execution gate.
 */

export const CUTOVER_RECONCILIATION_BLOCKED_STATUSES = [
  'EXPIRED',
  'INVALID_ORPHANED',
  'CANCELLED_TEST_DATA',
  'REQUIRES_REEVALUATION',
] as const;

export type CutoverReconciliationSemanticStatus =
  (typeof CUTOVER_RECONCILIATION_BLOCKED_STATUSES)[number];

export interface Rfc001CutoverReconciliation {
  status: string;
  reason: string;
  previousStatus: string;
  recordStatusPreserved?: string;
  executable: boolean;
  operator?: string;
  reconciledAt?: string;
  sourceRuntime?: string;
  decisionRunId?: string | null;
  hadEffectivePlan?: boolean;
  hadExecutionLock?: boolean;
  missingLinks?: string[];
}

export interface Rfc001RecordWithCutoverReconciliation {
  decisionId: string;
  recordStatus: string;
  effectivePlanVersionId?: string;
  cutoverReconciliation?: Rfc001CutoverReconciliation;
}
