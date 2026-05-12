/**
 * P3-1：Rewrite Simulation — 正确性优先阶段可先 full-rebuild fallback；
 * 此处仅占位：不对 TripPlan 做任何 mutate。
 */

import { createHash } from 'node:crypto';
import type { RewriteSimulation } from './rewrite-simulation.types';
import type { RewriteOperation } from './rewrite-operation.types';

export interface EvaluateRewriteSimulationInput {
  sourceProposalId?: string;
  kind?: RewriteSimulation['kind'];
  affectedDays: string[];
  operations: RewriteOperation[];
}

function stableRewriteId(input: EvaluateRewriteSimulationInput): string {
  const payload = JSON.stringify({
    p: input.sourceProposalId ?? '',
    k: input.kind ?? 'OTHER',
    d: [...input.affectedDays].sort(),
    o: [...input.operations].sort(),
  });
  return `rsim_${createHash('sha256').update(payload).digest('hex').slice(0, 16)}`;
}

/**
 * 占位评估器：后续接入受影响子图上的 temporal physics / constraint / road graph。
 * 禁止在此处调用 plan builder 写回主线 snapshot。
 */
export function evaluateRewriteSimulation(
  input: EvaluateRewriteSimulationInput,
): RewriteSimulation {
  const rewriteId = stableRewriteId(input);

  return {
    rewriteId,
    sourceProposalId: input.sourceProposalId,
    kind: input.kind ?? 'OTHER',
    affectedDays: [...input.affectedDays],
    operations: [...input.operations],
    projectedSignals: {},
    projectedConstraintChanges: {
      resolvedViolations: [],
      introducedViolations: [],
    },
    verdict: 'NEUTRAL',
    confidence: 0.35,
    lineageNote:
      'P3-A stub: hypothetical branch only; wire localized re-solve then set verdict/confidence',
  };
}
