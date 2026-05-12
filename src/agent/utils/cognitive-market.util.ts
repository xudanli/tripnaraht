/**
 * Cognitive Market — pricing, depreciation, and utility dynamics for `CognitiveArtifact`.
 */

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Asset pricing kernel — utilityScore = f(successRate, reuseRate, anomalyReduction).
 */
export function computeArtifactUtilityScore(params: {
  successRate: number;
  reuseRate: number;
  anomalyReduction: number;
}): number {
  const { successRate, reuseRate, anomalyReduction } = params;
  return clamp01(
    0.35 * clamp01(successRate) + 0.35 * clamp01(reuseRate) + 0.3 * clamp01(anomalyReduction),
  );
}

/**
 * Depreciation — low usage drift + anomaly shocks reduce utility (bounded).
 */
export function depreciateUtilityScore(
  current: number,
  params: {
    /** 0–1 fraction per depreciation event (staleness / idle). */
    usageDecay: number;
    /** Absolute penalty from anomaly signals (failure-driven market correction). */
    anomalyPenalty: number;
  },
): number {
  const afterDecay = current * (1 - clamp01(params.usageDecay));
  return Math.max(0, afterDecay - Math.max(0, params.anomalyPenalty));
}

/** Incremental blend after successful reuse (amortized reasoning — asset proves value). */
export function reinforceUtilityScore(current: number, delta: number): number {
  return clamp01(current + delta * (1 - current));
}
