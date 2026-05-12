/**
 * Deterministic scalar features from ExecutionTruthDAG — same DAG → same features (strategy biases applied elsewhere).
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';

export interface DagScoreFeatures {
  utility: number;
  risk: number;
  cost: number;
  stability: number;
}

export function computeDagScoreFeatures(dag: ExecutionTruthDAG): DagScoreFeatures {
  const nodes = dag.nodes;
  if (!nodes.length) {
    return { utility: 0, risk: 1, cost: 1, stability: 0 };
  }

  let reliabilitySum = 0;
  let riskSum = 0;
  let delaySum = 0;
  let okCount = 0;

  for (const n of nodes) {
    reliabilitySum += n.execution.reliabilityScore;
    riskSum +=
      n.temporal.arrivalRisk * 0.55 +
      n.weather.exposureScore * 0.35 +
      (n.temporal.daylightViolation ? 0.25 : 0);
    delaySum += n.execution.delayMinutes;
    if (n.execution.finalState === 'OK') {
      okCount += 1;
    }
  }

  const n = nodes.length;
  const maxDelayPerNode = 240;
  const costNorm = Math.min(1, delaySum / Math.max(1, n * maxDelayPerNode));

  return {
    utility: reliabilitySum / n,
    risk: Math.min(1, riskSum / n),
    cost: costNorm,
    stability: okCount / n,
  };
}
