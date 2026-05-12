/**
 * P-ECO-Closure-9 — Confidence saturates: beyond horizon, observation gain → 0 even if computation continues.
 */

export interface ConfidenceHorizonResult {
  confidenceSaturated: boolean;
  /** Estimated horizon [0,1] — lower ⇒ sooner saturation. */
  confidenceHorizon: number;
  /** Proxy for marginal epistemic gain from new observation this tick [0,1]. */
  observationGainProxy: number;
  uncertaintyThreshold: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function evaluateConfidenceHorizon(input: {
  uncertaintyVariance: number;
  observationGainProxy: number;
  uncertaintyThreshold?: number;
  gainEpsilon?: number;
}): ConfidenceHorizonResult {
  const uncertaintyThreshold = input.uncertaintyThreshold ?? 0.28;
  const gainEpsilon = input.gainEpsilon ?? 0.04;
  const u = input.uncertaintyVariance;
  const g = input.observationGainProxy;

  const saturated = u > uncertaintyThreshold && g <= gainEpsilon;
  const horizon = clamp01(1 - u * 0.65 + g * 0.25);

  return {
    confidenceSaturated: saturated,
    confidenceHorizon: horizon,
    observationGainProxy: g,
    uncertaintyThreshold,
  };
}
