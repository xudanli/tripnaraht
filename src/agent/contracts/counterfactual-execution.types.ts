/**
 * Counterfactual Execution Physics System (CEPS) — causal interventions do(a), not merely predictions.
 *
 * ECPS selects **optimal causal intervention**: a* ≈ argmax_a ΔU(a) with ΔU(a) = U(CMθ(s,do(a))) − U(baseline).
 * Legacy tiers become **intervention complexity** (edges / subgraph), not cognitive intensity enums.
 */

import type { ExecutionDecision } from './execution-control-policy.types';
import type { PredictedTrajectory, TrajectoryUtilityBreakdown } from './predictive-execution.types';

/** Pearl-style intervention handle — opaque to physics layer until SCM binds variables. */
export type CausalInterventionId = string;

/** One hypothetical world after CMθ(s, do(a)) — extends WM trajectory with intervention metadata. */
export interface CounterfactualWorld extends PredictedTrajectory {
  interventionId: CausalInterventionId;
  /** Structural complexity of do(a): low edge count ≈ former “fast branch”; multi-edge ≈ exploration. */
  interventionComplexity?: {
    causalEdgeCount: number;
    subgraphTag?: string;
  };
}

/** CMθ generator output: baseline factual τ⁰ plus intervened worlds. */
export interface CounterfactualGeneratorBundle {
  queryId: string;
  causalModelVersion?: string;
  /** Reference trajectory without explicit atomic intervention (observe / roll-forward). */
  baselineWorld: PredictedTrajectory;
  /** Worlds indexed by distinct do(a_i). */
  intervenedWorlds: CounterfactualWorld[];
}

/** CEPS outcome — causally optimal intervention folded into executable ECPS decision. */
export interface CounterfactualEcpsSelection {
  winningInterventionId: CausalInterventionId;
  baselineUtilityScore: number;
  intervenedUtilityScore: number;
  deltaUtility: number;
  utilityBreakdown: TrajectoryUtilityBreakdown;
  decision: ExecutionDecision;
}

/** Replay as causal consistency check — observed τ vs predicted counterfactual signatures. */
export interface CausalConsistencyValidation {
  interventionId: CausalInterventionId;
  predictedOutcomeScore: number;
  observedOutcomeScore: number;
  inconsistency: number;
  suggestedCalibration?: 'INTERVENTION_BIAS' | 'MODEL_DRIFT' | 'NONE';
}
