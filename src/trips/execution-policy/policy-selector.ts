/**
 * P11 — policy-first selection over simulation runs（可复现、可审计）。
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionSimulationRunResult } from '../execution-simulation/execution-simulation.types';
import type { ExecutionPolicy, SimulationPolicySelection } from './execution-policy.types';
import { scoreSimulationResult } from './policy-scorer';

export interface ScoredSimulationRun extends ExecutionSimulationRunResult {
  policyScore: number;
}

export function scoreSimulationRuns(
  runs: ExecutionSimulationRunResult[],
  policy: ExecutionPolicy,
  witness?: ExecutionTruthDAG,
): ScoredSimulationRun[] {
  return runs.map(r => ({
    ...r,
    policyScore: scoreSimulationResult(r, policy, witness),
  }));
}

/** 选取 **policyScore 最大** 的候选（越高越好）。 */
export function selectBestSimulation(
  runs: ExecutionSimulationRunResult[],
  policy: ExecutionPolicy,
  witness?: ExecutionTruthDAG,
): { best: ExecutionSimulationRunResult; score: number } {
  if (!runs.length) {
    throw new Error('selectBestSimulation: empty runs');
  }
  let best = runs[0];
  let bestScore = scoreSimulationResult(best, policy, witness);
  for (let i = 1; i < runs.length; i++) {
    const r = runs[i];
    const s = scoreSimulationResult(r, policy, witness);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return { best, score: bestScore };
}

/** 构造 Neptune / 日志用的结构化策略输出。 */
export function buildSimulationPolicySelection(
  runs: ExecutionSimulationRunResult[],
  policy: ExecutionPolicy,
  witness?: ExecutionTruthDAG,
): SimulationPolicySelection {
  const scored = scoreSimulationRuns(runs, policy, witness);
  const sorted = [...scored].sort((a, b) => b.policyScore - a.policyScore);
  const top = sorted[0];
  return {
    policyId: policy.id,
    ranked: sorted.map(s => ({ variantId: s.variantId, policyScore: s.policyScore })),
    selectedVariantId: top.variantId,
    selectedPolicyScore: top.policyScore,
  };
}
