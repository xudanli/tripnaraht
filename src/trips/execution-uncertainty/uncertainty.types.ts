/**
 * P-ECO-Closure-6 — Epistemic envelope over execution signals (observation noise, latent uncertainty).
 */

export type UncertaintySource =
  | 'physics_envelope'
  | 'overlay_temporal'
  | 'overlay_route'
  | 'causal_epistemic'
  | 'sensor_aggregate';

/** Aggregated uncertainty snapshot for stochastic closure / audit. */
export interface ExecutionUncertainty {
  /** Normalized [0,1] Shannon-style spread over categorical overlay / signal diversity. */
  entropy: number;
  /** Pooled variance proxy [0,1] — physics envelopes + temporal spread + causal gap. */
  variance: number;
  /** Inverse uncertainty — high when world signals align tightly. */
  confidence: number;
  uncertaintySources: UncertaintySource[];
}
