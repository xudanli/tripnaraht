/**
 * P-ECO-Closure-5 — Engineering contraction certificate (not a full Banach proof; auditable Lipschitz-style bound).
 */

export interface ContractionProof {
  /** True when estimated operator gain k < 1 on observed pair. */
  contractive: boolean;
  /** Estimated Lipschitz / contraction gain k (lower ⇒ “more contractive” under our norms). */
  lipschitzConstant: number;
  /** Heuristic confidence in this certificate [0,1]. */
  proofConfidence: number;
  /** k below oscillation window (empirical bound 0.92). */
  boundedOscillation: boolean;
  /** Patch load did not increase vs previous iterate. */
  monotonicPatchSequence: boolean;
  /** Mathematical divergence protection hint — caller may revert witness to last stable snapshot. */
  suggestRollback: boolean;
}
