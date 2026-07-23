/**
 * ONT-P2 — OutcomeReconciliation contract
 */

export const OUTCOME_RECONCILIATION_SCHEMA_ID =
  'tripnara.outcome_reconciliation@v1' as const;

export type ReconciliationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PARTIALLY_CONFIRMED'
  | 'DISCONFIRMED'
  | 'UNOBSERVABLE';

export interface OutcomeReconciliation {
  schemaId: typeof OUTCOME_RECONCILIATION_SCHEMA_ID;
  reconciliationId: string;
  predictionId: string;
  /** Optional P1 decision / action linkage for later phases */
  decisionId?: string;
  actionId?: string;

  predictedOutcome: {
    onsetAt?: string;
    deteriorationAt?: string;
    interventionDeadline?: string;
    peakLevel?: string;
    wouldAffectPlan?: boolean;
  };

  actualOutcome?: {
    onsetAt?: string;
    deteriorationAt?: string;
    peakLevel?: string;
    planAffected?: boolean;
    source: 'HISTORICAL_ACTUAL' | 'P1_REPLAY' | 'UNOBSERVED';
  };

  status: ReconciliationStatus;

  errorMetrics?: {
    /** minutes; positive = predicted later than actual */
    onsetErrorMinutes?: number;
    deteriorationErrorMinutes?: number;
    /** minutes before actual onset that deadline sat */
    deadlineLeadMinutes?: number;
    falsePositive?: boolean;
    falseNegative?: boolean;
  };

  reconciledAt?: string;
  evidenceRefs: string[];
  authorityMode: 'SHADOW';
}
