/**
 * Applies self-update proposals to **policy snapshots** immutably.
 * Guardrails: drift budget + optional shadow-approved ids (no blind inline promotion).
 */

import type { SelfUpdateProposal } from './execution-self-model.types';

/** Max sum of |numeric deltas| per promotion batch (L1 drift budget). */
export const DEFAULT_SELF_UPDATE_DRIFT_BUDGET = 0.15;

export interface MutablePolicySnapshot {
  /** ROUTE_DEPENDENCY aggregate scaler — semantic hook for DAG builder / ranking. */
  routeDependencyWeightFactor?: number;
  /** Repair gate — aligns with reflector REPAIR_THRESHOLD_SHIFT target name. */
  migrationNormalizedThreshold?: number;
  /** Arbitrary strategy knobs — Neptune / repair tuning. */
  strategyWeights?: Record<string, number>;
  /** When true, IR compiler may thin PROJECT:risk in a future compile pass — stored as intent flag. */
  deferRiskProjections?: boolean;
}

export interface ApplySelfUpdatesOptions {
  /** Max L1 drift; proposals exceeding remainder are dropped from tail after ranking. */
  driftBudget?: number;
  /** If set, only proposals whose `id` is listed are applied (shadow validation layer). */
  shadowApprovedIds?: ReadonlySet<string>;
}

function driftMagnitude(p: SelfUpdateProposal): number {
  switch (p.type) {
    case 'DAG_WEIGHT_DRIFT':
      return Math.abs(p.proposedDelta);
    case 'REPAIR_THRESHOLD_SHIFT':
      return Math.abs(p.delta);
    case 'IR_STEP_REDUCTION':
      return 0.08;
    default:
      return 0;
  }
}

export function filterProposalsByDriftBudget(
  proposals: SelfUpdateProposal[],
  budget: number = DEFAULT_SELF_UPDATE_DRIFT_BUDGET,
): SelfUpdateProposal[] {
  const out: SelfUpdateProposal[] = [];
  let spent = 0;
  for (const p of proposals) {
    const need = driftMagnitude(p);
    if (spent + need <= budget + 1e-9) {
      out.push(p);
      spent += need;
    }
  }
  return out;
}

export function applySelfUpdates(
  proposals: SelfUpdateProposal[],
  policies: MutablePolicySnapshot,
  options?: ApplySelfUpdatesOptions,
): { policies: MutablePolicySnapshot; applied: SelfUpdateProposal[]; skipped: SelfUpdateProposal[] } {
  const budget = options?.driftBudget ?? DEFAULT_SELF_UPDATE_DRIFT_BUDGET;
  const shadow = options?.shadowApprovedIds;

  let ranked = [...proposals];
  if (shadow !== undefined) {
    ranked = ranked.filter(p => shadow.has(p.id));
  }

  ranked = filterProposalsByDriftBudget(ranked, budget);

  const next: MutablePolicySnapshot = {
    ...policies,
    strategyWeights: { ...policies.strategyWeights },
  };

  const applied: SelfUpdateProposal[] = [];

  for (const p of ranked) {
    switch (p.type) {
      case 'DAG_WEIGHT_DRIFT':
        next.routeDependencyWeightFactor =
          (next.routeDependencyWeightFactor ?? 1) + p.proposedDelta;
        applied.push(p);
        break;
      case 'REPAIR_THRESHOLD_SHIFT':
        next.migrationNormalizedThreshold =
          (next.migrationNormalizedThreshold ?? 0.5) + p.delta;
        applied.push(p);
        break;
      case 'IR_STEP_REDUCTION':
        next.deferRiskProjections = true;
        next.strategyWeights = { ...next.strategyWeights, irThinRiskProjections: 1 };
        applied.push(p);
        break;
    }
  }

  const appliedIds = new Set(applied.map(a => a.id));
  const skipped = proposals.filter(p => !appliedIds.has(p.id));

  return { policies: next, applied, skipped };
}

/** Narrates policy mutation for Neptune “why we changed ourselves”. */
export function explainSelfModificationReason(proposals: SelfUpdateProposal[]): string[] {
  return proposals.map(
    p =>
      `[${p.type}] ${p.rationale} (confidence=${p.confidence.toFixed(2)})`,
  );
}
