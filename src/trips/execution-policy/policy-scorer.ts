/**
 * P11 — deterministic policy scoring（静态权重线性组合）。
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionSimulationRunResult } from '../execution-simulation/execution-simulation.types';
import type { ExecutionPolicy } from './execution-policy.types';
import { extractPolicyFeatures } from './policy-features';

export function scoreSimulationResult(
  result: ExecutionSimulationRunResult,
  policy: ExecutionPolicy,
  witness?: ExecutionTruthDAG,
): number {
  const r = extractPolicyFeatures(result, witness);
  const w = policy.weights;
  return (
    r.reliabilityProxy * w.reliability -
    r.costLoad * w.cost -
    r.daylightRiskProxy * w.daylightRisk -
    r.roadRiskProxy * w.roadRisk -
    r.crossDayStressProxy * w.crossDayPenalty
  );
}
