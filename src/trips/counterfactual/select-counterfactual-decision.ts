/**
 * P-Next 8 — Choose a branch by semantic optimality or weighted expected regret.
 */

import type { BranchEvaluation } from './evaluate-branches';
import type { CounterfactualBranch } from './physics-branch.types';
import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';
import {
  regretDistributionFromDistances,
  robustnessScoreFromStabilities,
} from './regret-model';

export type CounterfactualSelectionStrategy = 'optimistic_semantic' | 'min_expected_regret';

export interface CounterfactualDecisionResult {
  chosenBranchId: string;
  alternativeBranchIds: string[];
  regretDistribution: number[];
  robustnessScore: number;
  /** Branch picked by strategy (same id as chosen when weights unused). */
  evaluations: BranchEvaluation[];
}

/**
 * - **optimistic_semantic**: argmin semanticAggregateDistance.
 * - **min_expected_regret**: argmin sum_b P(b) · regret(b) over regret scores attached to evaluations (order-aligned with `branches`).
 */
export function selectCounterfactualDecision(
  baseline: BranchEvaluation,
  perturbed: BranchEvaluation[],
  branches: CounterfactualBranch[],
  strategy: CounterfactualSelectionStrategy = 'optimistic_semantic',
): CounterfactualDecisionResult {
  const all = [baseline, ...perturbed];
  const dists = all.map(e => e.semanticAggregateDistance);
  const regrets = regretDistributionFromDistances(dists);
  const withRegret = all.map((e, i) => ({ ...e, regretScore: regrets[i]! }));

  const stabilities = withRegret.map(e => e.stabilityScore);
  const robustnessScore = robustnessScoreFromStabilities(stabilities);

  const sumPert = branches.reduce((s, b) => s + b.probabilityWeight, 0);
  const wBase = Math.max(0.05, 1 - Math.min(1, sumPert));
  const rawW = [wBase, ...branches.map(b => b.probabilityWeight)];
  const wSum = rawW.reduce((a, b) => a + b, 0) || 1;
  const normWeights = rawW.map(w => w / wSum);

  let chosenIdx = 0;
  if (strategy === 'optimistic_semantic') {
    chosenIdx = dists.indexOf(Math.min(...dists));
  } else {
    let bestIdx = 0;
    let bestLoss = Number.POSITIVE_INFINITY;
    for (let k = 0; k < dists.length; k++) {
      let loss = 0;
      for (let j = 0; j < dists.length; j++) {
        const excess = Math.max(0, dists[j]! - dists[k]!);
        loss += normWeights[j]! * excess;
      }
      if (loss < bestLoss) {
        bestLoss = loss;
        bestIdx = k;
      }
    }
    chosenIdx = bestIdx;
  }

  const chosen = withRegret[chosenIdx]!;
  const alternatives = withRegret
    .filter((_, i) => i !== chosenIdx)
    .sort((a, b) => a.semanticAggregateDistance - b.semanticAggregateDistance)
    .map(e => e.branchId);

  return {
    chosenBranchId: chosen.branchId,
    alternativeBranchIds: alternatives,
    regretDistribution: regrets,
    robustnessScore,
    evaluations: withRegret,
  };
}

/** Merge P-Next 8 audit fields into an execution proof (typically the baseline replica proof). */
export function attachCounterfactualToProof(
  proof: ExecutionProof,
  decision: CounterfactualDecisionResult,
): ExecutionProof {
  return {
    ...proof,
    chosenBranchId: decision.chosenBranchId,
    alternativeBranches: decision.alternativeBranchIds,
    regretDistribution: decision.regretDistribution,
    robustnessScore: decision.robustnessScore,
  };
}
