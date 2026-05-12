/**
 * State distance and empirical Lipschitz-style gain between successive formal snapshots.
 */

import type { FormalIterationSnapshot } from './formal-snapshot';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Hamming style on digests + causal line distance. */
export function estimateStateDistance(a: FormalIterationSnapshot, b: FormalIterationSnapshot): number {
  const α = 0.25;
  const β = 0.25;
  const γ = 0.25;
  const δ = 0.25;

  const dagDelta = a.dagSummary === b.dagSummary ? 0 : 1;
  const irDelta = a.irSummary === b.irSummary ? 0 : 1;
  const physDelta = a.physicsSummary === b.physicsSummary ? 0 : 1;
  const causalDelta = Math.abs(a.causalConfidence - b.causalConfidence);

  return clamp01(α * dagDelta + β * irDelta + γ * physDelta + δ * causalDelta);
}

/**
 * One-step gain estimate: how far we moved in state space per unit “control effort”.
 * Lower k ⇒ more contractive-like step under bounded perturbation scale.
 */
export function estimateLipschitzConstant(
  prev: FormalIterationSnapshot,
  next: FormalIterationSnapshot,
): number {
  const stepDist = estimateStateDistance(prev, next);
  const effort = Math.max(
    0.06,
    prev.patchMagnitude + (1 - prev.causalConfidence) * 0.35,
  );
  const k = stepDist / effort;
  return Math.min(2, Math.max(0, k));
}
