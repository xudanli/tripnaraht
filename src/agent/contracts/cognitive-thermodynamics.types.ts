/**
 * Cognitive Thermodynamics Layer (CTL) — energy–entropy–work accounting over execution (no extra runtime services).
 *
 * Interpretation (first-law analogy): ΔE ≈ W + S + loss — cognitive energy budget partitions into
 * useful work, residual entropy, and dissipation.
 */

/** Scalar snapshot attached to observability (normalized unless noted). */
export interface CognitiveThermodynamicSnapshot {
  /**
   * ΔE — cognitive energy budget for this hop [0,1].
   * Proxy: latency + engine tier + reasoning depth cost.
   */
  delta_e: number;
  /** W — organized output / reuse value share (same scale as ΔE after partitioning). */
  work: number;
  /** S — entropy / disorder retained (trace variance & anomalies proxy). */
  entropy: number;
  /** Irrecoverable dissipation / wasted allocation. */
  loss: number;
  /** Numerical check: |ΔE − (W + S + loss)| (should be ≈ 0). */
  conservation_residual: number;
}
