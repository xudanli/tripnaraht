/**
 * P(V(S) < ε) certificate using Gaussian tail on Lyapunov energy surrogate.
 */

import { clamp01, normalCdf } from './math-normal';

export interface ProbabilisticStabilityCertificate {
  /** Approximate P(V < epsilon) under energy ~ N(mean, variance). */
  probabilityBelowEpsilon: number;
  epsilon: number;
  tau: number;
  probabilisticallyStable: boolean;
}

export function evaluateProbabilisticStability(input: {
  meanEnergy: number;
  energyVariance: number;
  epsilon: number;
  tau: number;
}): ProbabilisticStabilityCertificate {
  const { meanEnergy, energyVariance, epsilon, tau } = input;
  const sigma = Math.sqrt(Math.max(energyVariance, 1e-18));
  const prob =
    sigma < 1e-9
      ? meanEnergy < epsilon
        ? 1
        : 0
      : normalCdf((epsilon - meanEnergy) / sigma);

  const p = clamp01(prob);
  return {
    probabilityBelowEpsilon: p,
    epsilon,
    tau,
    probabilisticallyStable: p >= tau,
  };
}
