/**
 * Bundles P-ECO-Closure-4 audit flags from closure sequence + residual trajectory.
 */

import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { ConvergenceProofSketch } from './convergence-proof.types';
import { detectResidualDivergence } from './divergence-detector';
import { computeLyapunovSurrogate, isLyapunovNonIncreasing } from './lyapunov-surrogate';

export type { ConvergenceProofSketch } from './convergence-proof.types';

function monotonicNonIncreasing(xs: number[]): boolean {
  if (xs.length < 2) return true;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i]! > xs[i - 1]! + 1e-12) return false;
  }
  return true;
}

/**
 * Aggregates Lyapunov surrogate at last iterate, monotonicity of V, residual path, and iteration budget.
 */
export function buildConvergenceProofSketch(
  closureSequence: EcoNeptuneClosureEvaluation[],
  residualTrajectory: number[],
  iterationBound: number = 2,
): ConvergenceProofSketch {
  const last = closureSequence[closureSequence.length - 1];
  const lyapunovValue = last ? computeLyapunovSurrogate(last) : 0;
  const lyapunovNonIncreasing = isLyapunovNonIncreasing(closureSequence);
  const { divergent } = detectResidualDivergence(residualTrajectory);

  return {
    lyapunovValue,
    lyapunovNonIncreasing,
    iterationBound,
    divergent,
    monotonicResiduals: monotonicNonIncreasing(residualTrajectory),
  };
}
