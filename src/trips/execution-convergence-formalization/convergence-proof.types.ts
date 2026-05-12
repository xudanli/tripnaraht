/**
 * P-ECO-Closure-4 — Proof-oriented sketch (not a formal theorem; auditable invariants).
 */

/**
 * Lyapunov-style + iteration-budget + divergence flags for post-hoc or multi-tick audit.
 */
export interface ConvergenceProofSketch {
  /** V(S) ≈ distance from threshold slab; lower is “more stable” in this surrogate. */
  lyapunovValue: number;
  /** True if V does not increase along the provided closure sequence (length ≥ 2). */
  lyapunovNonIncreasing: boolean;
  /** Declared cap on operator iterations (product policy; default 2 in engine). */
  iterationBound: number;
  /** Residuals strictly increase over the trajectory (expansion / divergence warning). */
  divergent: boolean;
  /** Pairwise residuals r_{t+1} ≤ r_t along trajectory (length ≥ 2). */
  monotonicResiduals: boolean;
}
