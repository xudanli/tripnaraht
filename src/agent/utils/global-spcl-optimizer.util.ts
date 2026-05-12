/**
 * Cross-request ε aggregation → single bounded `ECPSRuntimeBias` step (global SPCL optimizer stub).
 */

import type { ECPSRuntimeBias } from '../contracts/policy-correction.types';
import type { SpclCalibrationOptions } from '../contracts/shadow-policy-calibration.types';
import type { SpclErrorBundle, SpclObservationSample } from '../contracts/shadow-policy-calibration.types';
import { mergeEcpsRuntimeBias } from './policy-correction-kernel.util';
import {
  computeSpclError,
  spclRuntimeBiasDelta,
} from './shadow-policy-calibration.util';

/** Average ε fields across samples — global error geometry over the ring buffer. */
export function mergeSpclErrorsAcrossSamples(samples: SpclObservationSample[]): SpclErrorBundle {
  if (!samples.length) {
    return { epsilonByAgent: {}, l2Norm: 0, maxAbsEpsilon: 0 };
  }
  const bundles = samples.map((s) => computeSpclError(s));
  const keys = new Set<string>();
  for (const b of bundles) {
    for (const k of Object.keys(b.epsilonByAgent)) keys.add(k);
  }
  const epsilonByAgent: SpclErrorBundle['epsilonByAgent'] = {};
  for (const k of keys) {
    let sum = 0;
    let c = 0;
    for (const b of bundles) {
      if (k in b.epsilonByAgent) {
        sum += b.epsilonByAgent[k];
        c += 1;
      }
    }
    epsilonByAgent[k] = c ? sum / c : 0;
  }
  let sumSq = 0;
  let maxAbs = 0;
  const n = keys.size || 1;
  for (const k of keys) {
    const e = epsilonByAgent[k];
    sumSq += e * e;
    maxAbs = Math.max(maxAbs, Math.abs(e));
  }
  return {
    epsilonByAgent,
    l2Norm: Math.sqrt(sumSq / n),
    maxAbsEpsilon: maxAbs,
  };
}

/** Ring buffer of paired SPCL observations — thread-safe single-process assumption (Nest singleton). */
export class GlobalSpclRingBuffer {
  private samples: SpclObservationSample[] = [];

  constructor(private readonly maxSamples: number) {}

  push(sample: SpclObservationSample): void {
    this.samples.push(sample);
    while (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  clear(): void {
    this.samples = [];
  }

  length(): number {
    return this.samples.length;
  }

  snapshot(): SpclObservationSample[] {
    return [...this.samples];
  }

  mergedErrorBundle(): SpclErrorBundle | null {
    if (!this.samples.length) return null;
    return mergeSpclErrorsAcrossSamples(this.samples);
  }
}

export function flushGlobalSpclBiasDelta(
  buffer: GlobalSpclRingBuffer,
  options?: SpclCalibrationOptions,
): Partial<ECPSRuntimeBias> | null {
  const merged = buffer.mergedErrorBundle();
  if (!merged || merged.l2Norm < 1e-15) return null;
  const delta = spclRuntimeBiasDelta(merged, options);
  const empty =
    (delta.replayThresholdShift ?? 0) === 0 &&
    (delta.system1BiasAdjustment ?? 0) === 0 &&
    (delta.anomalyPenaltyWeight ?? 0) === 0;
  return empty ? null : delta;
}

export function applyGlobalSpclToBias(
  current: ECPSRuntimeBias,
  buffer: GlobalSpclRingBuffer,
  options?: SpclCalibrationOptions,
): { next: ECPSRuntimeBias; applied: boolean } {
  const delta = flushGlobalSpclBiasDelta(buffer, options);
  if (!delta) return { next: current, applied: false };
  return { next: mergeEcpsRuntimeBias(current, delta), applied: true };
}
