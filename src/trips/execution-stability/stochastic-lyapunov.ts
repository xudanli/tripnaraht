/**
 * P-ECO-Closure-6 — Expected Lyapunov step under disturbance budgets: compare E[V] with noise-aware bands.
 */

import type { DisturbanceModel } from '../disturbance-model/disturbance-model.types';
import type { LyapunovEnergyCarrier } from './lyapunov.types';
import { computeLyapunovEnergy, DEFAULT_LYAPUNOV_WEIGHTS } from './evaluate-lyapunov';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export interface StochasticLyapunovState {
  expectedPrevEnergy: number;
  expectedNextEnergy: number;
  energyVariancePrev: number;
  energyVarianceNext: number;
  /** Strict decrease on mean carriers (zero-mean observation noise on scalars). */
  expectedEnergyDecreasing: boolean;
  /** Conservative one-sided separation using ~95% tails (audit gate). */
  noiseAwareLikelyDecreasing: boolean;
}

function lyapunovInputVariance(d: DisturbanceModel): {
  varDrift: number;
  varStability: number;
  varConvergence: number;
  varPatch: number;
} {
  return {
    varDrift: clamp01(d.weatherNoise * 0.045 + d.routeNoise * 0.032),
    varStability: clamp01(d.temporalNoise * 0.038),
    varConvergence: clamp01(d.routeNoise * 0.034),
    varPatch: clamp01(d.userDeviationNoise * 0.042),
  };
}

/** Propagate diagonal noise on surrogate inputs through linear V (same weights as deterministic layer). */
export function computeLyapunovEnergyVariance(
  vIn: ReturnType<typeof lyapunovInputVariance>,
  weights: typeof DEFAULT_LYAPUNOV_WEIGHTS = DEFAULT_LYAPUNOV_WEIGHTS,
): number {
  const w = weights;
  const raw =
    w.alpha ** 2 * vIn.varDrift +
    w.beta ** 2 * vIn.varStability +
    w.gamma ** 2 * vIn.varConvergence +
    w.delta ** 2 * vIn.varPatch;
  return clamp01(Math.min(1, raw));
}

export function evaluateStochasticLyapunov(
  prev: LyapunovEnergyCarrier | null,
  next: LyapunovEnergyCarrier,
  disturbance: DisturbanceModel,
): StochasticLyapunovState {
  const evPrev = prev !== null ? computeLyapunovEnergy(prev) : computeLyapunovEnergy(next);
  const evNext = computeLyapunovEnergy(next);

  const vin = lyapunovInputVariance(disturbance);
  const varPrev = computeLyapunovEnergyVariance(vin);
  const varNext = computeLyapunovEnergyVariance(vin);

  const sigmaP = Math.sqrt(Math.max(varPrev, 1e-18));
  const sigmaN = Math.sqrt(Math.max(varNext, 1e-18));

  const noiseAwareLikelyDecreasing =
    evNext + 1.65 * sigmaN < evPrev - 1.65 * sigmaP - 1e-9;

  return {
    expectedPrevEnergy: evPrev,
    expectedNextEnergy: evNext,
    energyVariancePrev: varPrev,
    energyVarianceNext: varNext,
    expectedEnergyDecreasing: evNext < evPrev - 1e-9,
    noiseAwareLikelyDecreasing,
  };
}
