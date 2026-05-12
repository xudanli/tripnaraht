import type { EcoClosurePolicy } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { IdentityPathCost } from './identity-trajectory.types';
import type { EcoIdentityLineage } from './eco-identity-lineage.types';
import type {
  ReconciliationDecision,
  ResolvedEcoReconciliationPolicy,
} from './eco-reconciliation.types';

const DEFAULTS = {
  rollbackPressureThreshold: 1.1,
  divergeEnergyThreshold: 2.75,
  acceptScoreThreshold: 0.75,
  softAlignScoreLower: 0.5,
  rejectionPressureLowMax: 0.35,
} as const;

/**
 * Merge explicit policy, defaults, and `TRIP_IDENTITY_RECONCILIATION_ENABLE=1`.
 */
export function resolveEcoReconciliationPolicy(
  policy?: EcoClosurePolicy | null,
): ResolvedEcoReconciliationPolicy {
  const r = policy?.reconciliation;
  const envEnabled = process.env.TRIP_IDENTITY_RECONCILIATION_ENABLE === '1';
  const enabled = r?.enabled === true || (r?.enabled === false ? false : envEnabled);

  return {
    enabled: Boolean(enabled),
    rollbackPressureThreshold: r?.rollbackPressureThreshold ?? DEFAULTS.rollbackPressureThreshold,
    divergeEnergyThreshold: r?.divergeEnergyThreshold ?? DEFAULTS.divergeEnergyThreshold,
    acceptScoreThreshold: r?.acceptScoreThreshold ?? DEFAULTS.acceptScoreThreshold,
    softAlignScoreLower: r?.softAlignScoreLower ?? DEFAULTS.softAlignScoreLower,
    rejectionPressureLowMax: r?.rejectionPressureLowMax ?? DEFAULTS.rejectionPressureLowMax,
  };
}

/**
 * Pure reconciliation classifier over P-E3 {@link IdentityPathCost}.
 * `lineage` is reserved for future branch-local rules; unused in the minimal rule set.
 */
export function evaluateIdentityReconciliation(
  pathCost: IdentityPathCost,
  _lineage: EcoIdentityLineage[],
  p: ResolvedEcoReconciliationPolicy,
): ReconciliationDecision {
  const { mutationEnergy, rejectionPressure, stabilityDecay } = pathCost.components;
  const score = pathCost.normalizedScore;

  const rollbackPressure = stabilityDecay + rejectionPressure;
  if (rollbackPressure >= p.rollbackPressureThreshold) {
    return {
      type: 'ROLLBACK_BRANCH',
      reason: `rollback_pressure=${rollbackPressure.toFixed(4)}>=${p.rollbackPressureThreshold}`,
    };
  }

  const divergeEnergy = mutationEnergy + rejectionPressure;
  if (divergeEnergy >= p.divergeEnergyThreshold) {
    return {
      type: 'HARD_DIVERGE',
      reason: `diverge_energy=${divergeEnergy.toFixed(4)}>=${p.divergeEnergyThreshold}`,
    };
  }

  if (score > p.acceptScoreThreshold && rejectionPressure <= p.rejectionPressureLowMax) {
    return { type: 'ACCEPT' };
  }

  if (score > p.softAlignScoreLower && score <= p.acceptScoreThreshold) {
    return { type: 'SOFT_ALIGN' };
  }

  if (score > p.acceptScoreThreshold && rejectionPressure > p.rejectionPressureLowMax) {
    return { type: 'SOFT_ALIGN' };
  }

  return {
    type: 'HARD_DIVERGE',
    reason: `weak_score=${score.toFixed(4)}`,
  };
}
