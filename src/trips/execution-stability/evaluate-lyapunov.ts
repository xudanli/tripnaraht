/**
 * V(S) = α·drift + β·(1−stability) + γ·(1−convergence) + δ·patchMagnitude.
 */

import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { LyapunovEnergyCarrier, LyapunovState } from './lyapunov.types';

export type { LyapunovEnergyCarrier, LyapunovState } from './lyapunov.types';

/** Default weights (sum ≈ 1). */
export const DEFAULT_LYAPUNOV_WEIGHTS = {
  alpha: 0.35,
  beta: 0.25,
  gamma: 0.25,
  delta: 0.15,
} as const;

const DEFAULT_STABLE_THRESHOLD = 0.18;

export function computeLyapunovEnergy(
  s: LyapunovEnergyCarrier,
  weights: typeof DEFAULT_LYAPUNOV_WEIGHTS = DEFAULT_LYAPUNOV_WEIGHTS,
): number {
  const w = weights;
  return Math.min(
    1,
    Math.max(
      0,
      w.alpha * s.ecoDriftScore +
        w.beta * (1 - s.stabilityScore) +
        w.gamma * (1 - s.semanticConvergence) +
        w.delta * s.patchMagnitude,
    ),
  );
}

/**
 * Compare successive energy carriers. If `prev` is null, delta is 0 (first labeling of V at `next`).
 */
/** Map closure scalars + normalized patch load into energy inputs. */
export function closureToLyapunovCarrier(
  c: EcoNeptuneClosureEvaluation,
  patchMagnitude: number,
): LyapunovEnergyCarrier {
  return {
    ecoDriftScore: c.ecoDriftScore,
    stabilityScore: c.stabilityScore,
    semanticConvergence: c.semanticConvergence,
    patchMagnitude,
  };
}

export function evaluateLyapunov(
  prev: LyapunovEnergyCarrier | null,
  next: LyapunovEnergyCarrier,
  options?: {
    weights?: typeof DEFAULT_LYAPUNOV_WEIGHTS;
    stableThreshold?: number;
  },
): LyapunovState {
  const weights = options?.weights ?? DEFAULT_LYAPUNOV_WEIGHTS;
  const stableThreshold = options?.stableThreshold ?? DEFAULT_STABLE_THRESHOLD;

  const nextV = computeLyapunovEnergy(next, weights);
  const prevV = prev !== null ? computeLyapunovEnergy(prev, weights) : nextV;
  const delta = nextV - prevV;

  return {
    value: nextV,
    delta,
    decreasing: nextV < prevV - 1e-9,
    stableRegion: nextV < stableThreshold,
  };
}
