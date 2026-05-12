/**
 * P-ECO-Closure-4 — Lyapunov-style stability semantics over execution closure scalars.
 */

/** Scalar energy audit after comparing successive correction iterates. */
export interface LyapunovState {
  /** V(S_next) — nonnegative surrogate “energy”. */
  value: number;
  /** V_next − V_prev (negative ⇒ dissipating instability). */
  delta: number;
  /** Strict decrease vs previous iterate. */
  decreasing: boolean;
  /** Below stable energy threshold ε_V. */
  stableRegion: boolean;
}

/** Inputs for V(S); patch magnitude is normalized caller-side [0,1]. */
export interface LyapunovEnergyCarrier {
  ecoDriftScore: number;
  stabilityScore: number;
  semanticConvergence: number;
  patchMagnitude: number;
}
