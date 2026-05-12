/**
 * Aggregates physics envelopes, overlay spread, and causal epistemic gap into {@link ExecutionUncertainty}.
 */

import type { TripWorldState } from '../decision/world-model';
import type { ExecutionUncertainty, UncertaintySource } from '../execution-uncertainty/uncertainty.types';
import { clamp01 } from './math-normal';

function overlayEntropy(frames: NonNullable<TripWorldState['signals']['executionOverlayFrames']>): number {
  if (!frames.length) return 0;
  const sevCounts = new Map<string, number>();
  for (const f of frames) {
    const k = f.weather.severity;
    sevCounts.set(k, (sevCounts.get(k) ?? 0) + 1);
  }
  const counts = [...sevCounts.values()];
  const n = frames.length;
  let h = 0;
  for (const c of counts) {
    const p = c / n;
    if (p > 0) h -= p * Math.log(p);
  }
  const denom = Math.log(Math.max(2, counts.length));
  return denom > 0 ? clamp01(h / denom) : 0;
}

/** Materialize uncertainty carriers from current world signals (engineering aggregation). */
export function buildExecutionUncertainty(state: TripWorldState): ExecutionUncertainty {
  const sources: UncertaintySource[] = [];
  let varianceAccum = 0;

  const idx = state.signals.physicsFieldIndex;
  if (idx?.byLegId && Object.keys(idx.byLegId).length) {
    const legs = Object.values(idx.byLegId);
    let n = 0;
    let pooled = 0;
    for (const leg of legs) {
      const u = leg.uncertainty;
      if (u) {
        n += 1;
        pooled +=
          u.weatherVariance + u.routeVolatility + u.fuelEstimateError + u.temporalDrift;
      }
    }
    if (n > 0) {
      varianceAccum += clamp01(pooled / (4 * n));
      sources.push('physics_envelope');
    }
  }

  const frames = state.signals.executionOverlayFrames ?? [];
  if (frames.length >= 2) {
    const delays = frames.map(f => f.temporal.unifiedDelayMinutes);
    const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
    const varD = delays.reduce((s, x) => s + (x - mean) ** 2, 0) / delays.length;
    varianceAccum += clamp01(Math.min(1, varD / 400));
    sources.push('overlay_temporal');
  }

  if (frames.length >= 2) {
    const scores = frames.map(f => (f.road.blocked ? 1 : 0) + (f.road.fRoadConstraint ? 0.5 : 0));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const varR = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
    if (varR > 0.02) {
      varianceAccum += clamp01(varR * 0.5);
      sources.push('overlay_route');
    }
  }

  const conf = state.signals.reflectiveCausalModel?.meta.confidence ?? 1;
  const epistemic = 1 - clamp01(conf);
  if (epistemic > 0.02) {
    varianceAccum += epistemic * 0.2;
    sources.push('causal_epistemic');
  }

  if (frames.length) {
    sources.push('sensor_aggregate');
  }

  varianceAccum = clamp01(varianceAccum / 1.35);

  const overlayEnt = frames.length ? overlayEntropy(frames) : 0;
  const entropy = clamp01(overlayEnt * 0.55 + varianceAccum * 0.45);
  const confidence = clamp01(1 - entropy * 0.62 - varianceAccum * 0.38);

  return {
    entropy,
    variance: varianceAccum,
    confidence,
    uncertaintySources: [...new Set(sources)],
  };
}
