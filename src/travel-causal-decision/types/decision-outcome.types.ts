/**
 * Loop 2 — Outcome reconciliation (product-facing).
 *
 * Distinct from ECO identity / workspace / cutover "reconciliation".
 * Proves whether long-run judgments were effective, not only that reasoning was compliant.
 */

export const DECISION_OUTCOME_SCHEMA = 'tripnara.decision_outcome@v1' as const;

export type OutcomeReconciliationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PARTIAL'
  | 'DISPROVED'
  | 'UNOBSERVABLE';

export interface SimulatedOutcomeSnapshot {
  arrivalTime?: string;
  completionProbability?: number;
  riskLevel?: string;
  costImpact?: number;
  /** Extra domain metrics (e.g. iceland_miss_prob) — JSON-serializable. */
  metrics?: Record<string, number>;
}

export interface ActualOutcomeSnapshot {
  arrivalTime?: string;
  completed?: boolean;
  observedRiskLevel?: string;
  actualCost?: number;
  metrics?: Record<string, number>;
  observedAt?: string;
  sources?: string[];
}

export interface DecisionOutcome {
  schema: typeof DECISION_OUTCOME_SCHEMA;
  decisionId: string;
  tripId?: string;
  selectedOptionId?: string;

  predictedOutcome: SimulatedOutcomeSnapshot;
  actualOutcome?: ActualOutcomeSnapshot;

  reconciliation: OutcomeReconciliationStatus;
  reconciledAt?: string;
  explanation?: string;

  /** Cross-ref into Decision Ledger / DecisionOutcomeValidation when present. */
  ledgerRef?: string;
  outcomeValidationId?: string;
}
