/**
 * SPCL core — ε = ΔΦ_exec − ΔΦ_shadow; map to bounded `ECPSRuntimeBias` deltas (stub gradient).
 */

import type { ECPSRuntimeBias } from '../contracts/policy-correction.types';
import type {
  PhiDeltaByAgent,
  SpclCalibrationOptions,
  SpclErrorBundle,
  SpclObservationSample,
} from '../contracts/shadow-policy-calibration.types';
import { mergeEcpsRuntimeBias } from './policy-correction-kernel.util';

function unionKeys(a: PhiDeltaByAgent, b: PhiDeltaByAgent): Set<string> {
  return new Set([...Object.keys(a), ...Object.keys(b)]);
}

/** ε_i = ΔΦ_exec_i − ΔΦ_shadow_i */
export function computeSpclError(sample: SpclObservationSample): SpclErrorBundle {
  const epsilonByAgent: PhiDeltaByAgent = {};
  const keys = unionKeys(sample.deltaPhiExec, sample.deltaPhiShadow);
  let sumSq = 0;
  let maxAbs = 0;
  for (const k of keys) {
    const e = (sample.deltaPhiExec[k] ?? 0) - (sample.deltaPhiShadow[k] ?? 0);
    epsilonByAgent[k] = e;
    sumSq += e * e;
    maxAbs = Math.max(maxAbs, Math.abs(e));
  }
  const n = keys.size || 1;
  const l2Norm = Math.sqrt(sumSq / n);
  return { epsilonByAgent, l2Norm, maxAbsEpsilon: maxAbs };
}

/** Mean ε — coarse gradient direction when agents share comparable scale. */
export function meanEpsilon(bundle: SpclErrorBundle): number {
  const vals = Object.values(bundle.epsilonByAgent);
  if (!vals.length) return 0;
  return vals.reduce((s, x) => s + x, 0) / vals.length;
}

/**
 * Stub ∇||ε|| → bias: large mismatch increases anomaly sensitivity and nudges replay gate /
 * reuse-friendly SYSTEM1 bias conservatively. Bounded for stability.
 */
export function spclRuntimeBiasDelta(
  bundle: SpclErrorBundle,
  options: SpclCalibrationOptions = {},
): Partial<ECPSRuntimeBias> {
  const eta = options.eta ?? 0.06;
  const scale = Math.min(1, bundle.l2Norm);
  if (scale < 1e-12) return {};

  const m = meanEpsilon(bundle);
  const sign = m === 0 ? 1 : Math.sign(m);

  return {
    replayThresholdShift: clamp(-eta * scale * sign * 0.35, -0.25, 0.25),
    anomalyPenaltyWeight: eta * scale * 0.4,
    system1BiasAdjustment: clamp(-eta * scale * sign * 0.2, -0.2, 0.2),
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** ECPSθ+1 ≈ ECPSθ + Δ — merge SPCL step into runtime bias. */
export function applySpclCalibrationStep(
  current: ECPSRuntimeBias,
  sample: SpclObservationSample,
  options?: SpclCalibrationOptions,
): ECPSRuntimeBias {
  const err = computeSpclError(sample);
  const delta = spclRuntimeBiasDelta(err, options);
  return mergeEcpsRuntimeBias(current, delta);
}
