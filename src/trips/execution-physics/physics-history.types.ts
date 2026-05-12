/**
 * Minimal history for physics inference — map from memory / multiverse batches.
 */

export interface PhysicsObservationHistory {
  entries: Array<{
    vmOk: boolean;
    /** Worlds or branches touched in this observation. */
    branchCount?: number;
    /** Heuristic: predicted vs witnessed causal edge mismatch. */
    causalConflict?: boolean;
    /** Count of collapse rule flips / jitter in one tick. */
    collapseJitters?: number;
    /** Delay drift vs expectation — normalized [0,1]. */
    timeSkew?: number;
  }>;
}
