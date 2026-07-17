/**
 * Map product OutcomeReconciliationStatus ↔ DecisionOutcomeValidation verdict.
 * Keeps Loop 2 naming distinct from legacy PARTIALLY_CONFIRMED / REFUTED / INCONCLUSIVE.
 */

import type { OutcomeReconciliationStatus } from '../types/decision-outcome.types';

export type LegacyOutcomeValidationVerdict =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PARTIALLY_CONFIRMED'
  | 'REFUTED'
  | 'INCONCLUSIVE';

export function toOutcomeReconciliationStatus(
  verdict: LegacyOutcomeValidationVerdict,
): OutcomeReconciliationStatus {
  switch (verdict) {
    case 'PENDING':
      return 'PENDING';
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'PARTIALLY_CONFIRMED':
      return 'PARTIAL';
    case 'REFUTED':
      return 'DISPROVED';
    case 'INCONCLUSIVE':
      return 'UNOBSERVABLE';
    default:
      return 'UNOBSERVABLE';
  }
}

export function toLegacyOutcomeValidationVerdict(
  status: OutcomeReconciliationStatus,
): LegacyOutcomeValidationVerdict {
  switch (status) {
    case 'PENDING':
      return 'PENDING';
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'PARTIAL':
      return 'PARTIALLY_CONFIRMED';
    case 'DISPROVED':
      return 'REFUTED';
    case 'UNOBSERVABLE':
      return 'INCONCLUSIVE';
    default:
      return 'INCONCLUSIVE';
  }
}
