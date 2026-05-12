/**
 * P-E4 — Reconciliation operator: policy over P-E3 path cost (minimal control layer).
 * No merge / consensus / replay — only labels + optional commit rejection (ROLLBACK_BRANCH).
 */

import type { IdentityPathCost } from './identity-trajectory.types';
import type { EcoIdentityLineage } from './eco-identity-lineage.types';

export type ReconciliationDecision =
  | { type: 'ACCEPT' }
  | { type: 'SOFT_ALIGN' }
  | { type: 'HARD_DIVERGE'; reason?: string }
  | { type: 'ROLLBACK_BRANCH'; reason: string };

/** Tunable thresholds; enforced only when {@link ResolvedEcoReconciliationPolicy.enabled}. */
export interface EcoReconciliationPolicy {
  /** Default false unless `TRIP_IDENTITY_RECONCILIATION_ENABLE=1` or set true here. */
  enabled?: boolean;
  /** `stabilityDecay + rejectionPressure` ≥ this ⇒ {@link ReconciliationDecision} ROLLBACK_BRANCH. */
  rollbackPressureThreshold?: number;
  /** `mutationEnergy + rejectionPressure` ≥ this ⇒ HARD_DIVERGE (label). */
  divergeEnergyThreshold?: number;
  /** `normalizedScore` > this and low rejection ⇒ ACCEPT. */
  acceptScoreThreshold?: number;
  /** Exclusive lower bound for SOFT_ALIGN band vs ACCEPT cutoff. */
  softAlignScoreLower?: number;
  /** rejectionPressure ≤ this counts as “low” for ACCEPT. */
  rejectionPressureLowMax?: number;
}

export interface ResolvedEcoReconciliationPolicy {
  enabled: boolean;
  rollbackPressureThreshold: number;
  divergeEnergyThreshold: number;
  acceptScoreThreshold: number;
  softAlignScoreLower: number;
  rejectionPressureLowMax: number;
}

export type EvaluateIdentityReconciliationFn = (
  pathCost: IdentityPathCost,
  lineage: EcoIdentityLineage[],
  policy: ResolvedEcoReconciliationPolicy,
) => ReconciliationDecision;
