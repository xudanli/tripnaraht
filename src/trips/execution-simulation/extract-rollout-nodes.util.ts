/**
 * Extract per-node rollout contexts from ExecutionTruthDAG (deterministic order).
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { RolloutNodeContext } from './robustness-rollout.types';

export function extractRolloutNodeContexts(dag: ExecutionTruthDAG): RolloutNodeContext[] {
  const sorted = [...dag.nodes].sort((a, b) => {
    const dc = a.date.localeCompare(b.date);
    if (dc !== 0) return dc;
    return a.id.localeCompare(b.id);
  });

  return sorted.map(node => {
    const durationMinutes = Math.max(15, node.execution.delayMinutes || 60);
    const weatherSeverity = node.weather?.exposureScore ?? 0;
    const roadStress = 1 - (node.road?.accessibility ?? 1);
    const elevationGainM = Math.round(roadStress * 800 + node.temporal.arrivalRisk * 400);

    return {
      nodeId: node.id,
      date: node.date,
      durationMinutes,
      elevationGainM,
      weatherSeverity,
    };
  });
}
