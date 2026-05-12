/**
 * P-ECO-Closure-3 — Fixed-point carrier types (distinct from {@link ExecutionConvergenceState} audit bundle).
 */

import type { NeptuneRepairResult } from '../decision/strategies/neptune';

/** Materialized iterate St along F ≈ Neptune → ECO → Closure (optional Patch). */
export interface ExecutionStateSnapshot {
  iterationIndex: number;
  /**
   * Scalar residual marking distance from fixed-point at this iterate:
   * pass-1: manifold violation; pass-k: pairwise Neptune delta vs previous Neptune bundle.
   */
  residualDelta: number;
  neptune: NeptuneRepairResult;
  closureInstability: number;
  stateHash: string;
}

/**
 * Fixed-point certificate for one evaluate step — answers “has F(S) ≈ S under ε?”
 * `contractionRate` uses ±1 per user spec (contractive vs expansive step along residual).
 */
export interface ExecutionFixedPoint {
  stateHash: string;
  residualDelta: number;
  /** +1 if residual shrank vs previous snapshot’s residual reference; −1 otherwise (two-pass). First pass: +1. */
  contractionRate: number;
  isFixedPoint: boolean;
  iterationIndex: number;
  /** Heuristic confidence in convergence narrative [0,1]. */
  convergenceConfidence: number;
}

/** Trajectory-level view for contraction / Lyapunov-style audits (multi-tick). */
export interface ConvergenceManifold {
  states: ExecutionStateSnapshot[];
  residualTrajectory: number[];
  /** Same length as `states.length - 1`; +1/-1 contractive steps. */
  contractionVector: number[];
  /** Strict decrease of residuals along recorded trajectory. */
  isContractiveSystem: boolean;
}
