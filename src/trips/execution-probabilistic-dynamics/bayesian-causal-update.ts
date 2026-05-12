/**
 * Lightweight posterior sketch over causal edges — P(weight | meta-confidence), audit-oriented.
 */

import type { CausalModel } from '../causal-reflection/causal-model.types';
import { clamp01 } from './math-normal';

export interface CausalEdgePosterior {
  edgeId: string;
  meanWeight: number;
  posteriorVariance: number;
}

export interface BayesianCausalUpdateResult {
  edges: CausalEdgePosterior[];
  /** Aggregate coherence [0,1] — higher when posteriors are sharp under confident meta. */
  observationLikelihood: number;
}

function edgeKey(e: { from: string; to: string }): string {
  return `${e.from}->${e.to}`;
}

/**
 * Treat structural weights as posterior means; variance shrinks with causal meta-confidence.
 */
export function evaluateBayesianCausalUpdate(model: CausalModel | undefined): BayesianCausalUpdateResult {
  if (!model?.edges?.length) {
    return { edges: [], observationLikelihood: 1 };
  }

  const metaConf = clamp01(Math.max(0.08, model.meta.confidence));
  const edges: CausalEdgePosterior[] = model.edges.map(e => {
    const w = clamp01(e.weight);
    const priorVar = 0.06 / metaConf;
    const posteriorVariance = clamp01(priorVar / (1 + metaConf));
    return {
      edgeId: edgeKey(e),
      meanWeight: w,
      posteriorVariance,
    };
  });

  const meanVar =
    edges.reduce((s, x) => s + x.posteriorVariance, 0) / Math.max(1, edges.length);
  const observationLikelihood = clamp01(metaConf * (1 - meanVar * 0.5));

  return { edges, observationLikelihood };
}
