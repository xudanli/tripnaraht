/**
 * P-ECO-Closure-3 — Convergence semantics (fixed-point view over the execution operator).
 */

/** Result of comparing two correction iterations or assessing single-pass proximity to the stability manifold. */
export interface ExecutionConvergenceState {
  /**
   * True when post-step state lies near a formal fixed-point:
   * small residual (when two passes exist), small manifold distance, and closure no longer requests rerun.
   */
  isFixedPoint: boolean;
  /**
   * Normalized [0,1] mismatch between successive Neptune materializations (triggers / slots / VM summary).
   * Zero when only one pass ran (no pairwise comparison).
   */
  residualDelta: number;
  /**
   * Normalized improvement in composite instability from closure-before to closure-after (two-pass).
   * In [0,1]; higher means stronger contraction. Single-pass: 1 when already non-rerun, else reflects manifold gap.
   */
  contractionRate: number;
  /**
   * Proximity to the interior of threshold-defined stability region [0,1]; 1 = on manifold.
   */
  stabilityManifold: number;
  /** Threshold used for residual fixed-point (audit). */
  epsilonResidual?: number;
  /** Threshold used for manifold distance (audit). */
  epsilonManifold?: number;
}

export interface ConvergenceSemanticsOptions {
  /** Max allowed normalized Neptune residual for fixed-point. Default 0.06. */
  epsilonResidual?: number;
  /** Max manifold distance to hyper-rectangle of thresholds. Default 0.08. */
  epsilonManifold?: number;
}
