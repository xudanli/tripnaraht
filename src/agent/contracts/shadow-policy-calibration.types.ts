/**
 * Shadow-to-Policy Calibration Loop (SPCL) — shadow physics predicts ΔΦ_shadow;
 * execution yields ΔΦ_exec; ε = ΔΦ_exec − ΔΦ_shadow drives ECPSθ updates (via `ECPSRuntimeBias`).
 */

/** Per-agent scalar control / field increment (same keys as NCGES particle ids). */
export type PhiDeltaByAgent = Record<string, number>;

/** One paired observation for calibration (replay-supervised or online). */
export interface SpclObservationSample {
  /** Effectively realized increment — from telemetry, traces, or actuator logs. */
  deltaPhiExec: PhiDeltaByAgent;
  /** Shadow model (e.g. NCGES preview) predicted increment. */
  deltaPhiShadow: PhiDeltaByAgent;
}

/** ε field summary — gradient surrogate for ||ε||. */
export interface SpclErrorBundle {
  epsilonByAgent: PhiDeltaByAgent;
  l2Norm: number;
  maxAbsEpsilon: number;
}

export interface SpclCalibrationOptions {
  /** Step size η — scales bias deltas (typical 0.02–0.12). */
  eta?: number;
}
