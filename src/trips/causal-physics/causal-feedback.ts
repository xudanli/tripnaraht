/**
 * P-Next 9 — Self-correction: nudge edge weights when predicted utility misses observed outcome.
 */

import type { CausalGraph } from './causal-graph.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export interface CausalFeedbackInput {
  graph: CausalGraph;
  /** Utility implied by planner (0–1). */
  predictedUtility: number;
  /** Observed utility proxy after execution (0–1). */
  observedUtility: number;
  /** Learning rate for weight moves. Default 0.08 */
  learningRate?: number;
}

/**
 * Simple heuristic: if we **over-predicted**, weaken CAUSES edges slightly; if **under-predicted**, strengthen them.
 * Deterministic and bounded — suitable for audit loops.
 */
export function correctCausalWeights(input: CausalFeedbackInput): CausalGraph {
  const lr = input.learningRate ?? 0.08;
  const gap = input.observedUtility - input.predictedUtility;

  const edges = input.graph.edges.map(e => {
    let delta = 0;
    if (e.relation === 'CAUSES') {
      delta = lr * Math.sign(gap);
    } else if (e.relation === 'CONSTRAINS') {
      delta = (lr * 0.5) * Math.sign(-gap);
    } else {
      delta = (lr * 0.35) * Math.sign(gap);
    }
    return {
      ...e,
      weight: clamp01(e.weight + delta),
    };
  });

  return { ...input.graph, edges };
}
