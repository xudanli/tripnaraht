/**
 * Engineering certificate: P(||F(S) − S|| < ε) lower bound using residual surrogate + noise inflation.
 */

import type { ExecutionUncertainty } from '../execution-uncertainty/uncertainty.types';
import type { DisturbanceModel } from '../disturbance-model/disturbance-model.types';
import { clamp01, normalCdf } from './math-normal';

export interface ProbabilisticFixedPointSketch {
  epsilonResidual: number;
  /** Lower bound on P(residual < ε) under additive residual noise. */
  convergenceProbabilityLowerBound: number;
  tau: number;
  highProbabilityConvergent: boolean;
}

/** Map pooled uncertainty + disturbances into residual variance proxy [0,1]. */
export function estimateResidualVariance(
  u: ExecutionUncertainty,
  d: DisturbanceModel,
): number {
  return clamp01(u.variance * 0.14 + d.temporalNoise * 0.09 + d.routeNoise * 0.06 + d.weatherNoise * 0.05);
}

export function evaluateProbabilisticFixedPointSketch(input: {
  residualDelta: number;
  epsilonResidual: number;
  residualVariance: number;
  tau: number;
}): ProbabilisticFixedPointSketch {
  const { residualDelta, epsilonResidual, residualVariance, tau } = input;
  const sigma = Math.sqrt(Math.max(residualVariance, 1e-18));
  const prob =
    sigma < 1e-9
      ? residualDelta < epsilonResidual
        ? 1
        : 0
      : normalCdf((epsilonResidual - residualDelta) / sigma);

  const p = clamp01(prob);
  return {
    epsilonResidual,
    convergenceProbabilityLowerBound: p,
    tau,
    highProbabilityConvergent: p >= tau,
  };
}
