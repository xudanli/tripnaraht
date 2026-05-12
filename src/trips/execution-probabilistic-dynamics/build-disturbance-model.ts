/**
 * Maps physical envelopes + overlay kinematics into named disturbance channels ξ_k(t).
 */

import type { TripWorldState } from '../decision/world-model';
import type { DisturbanceModel } from '../disturbance-model/disturbance-model.types';
import { clamp01 } from './math-normal';

const DEFAULT_NOISE = 0.06;

/** Derive disturbance budgets [0,1] from indexed physics + overlay frames. */
export function buildDisturbanceModel(state: TripWorldState): DisturbanceModel {
  let weatherNoise = DEFAULT_NOISE;
  let routeNoise = DEFAULT_NOISE;
  let temporalNoise = DEFAULT_NOISE;
  let userDeviationNoise = 0.08;

  const idx = state.signals.physicsFieldIndex;
  if (idx?.byLegId && Object.keys(idx.byLegId).length) {
    const legs = Object.values(idx.byLegId);
    let n = 0;
    let wSum = 0;
    let rSum = 0;
    let tSum = 0;
    for (const leg of legs) {
      const u = leg.uncertainty;
      if (u) {
        n += 1;
        wSum += u.weatherVariance;
        rSum += u.routeVolatility;
        tSum += u.temporalDrift;
      }
    }
    if (n > 0) {
      weatherNoise = clamp01(wSum / n);
      routeNoise = clamp01(rSum / n);
      temporalNoise = clamp01(tSum / n);
    }
  }

  const frames = state.signals.executionOverlayFrames ?? [];
  if (frames.length >= 2) {
    const drifts = frames.map(f => f.temporal.driftMinutes);
    const mean = drifts.reduce((a, b) => a + b, 0) / drifts.length;
    const varD = drifts.reduce((s, x) => s + (x - mean) ** 2, 0) / drifts.length;
    userDeviationNoise = clamp01(Math.sqrt(varD) / 90);
  }

  return {
    weatherNoise,
    routeNoise,
    temporalNoise,
    userDeviationNoise,
  };
}
