/**
 * Predictive Execution — World Model + ECPS over **future trajectories**, not instantaneous state alone.
 *
 * ECPS role: trajectory utility optimizer argmax_τ U(τ) under WMθ rollouts.
 * Legacy SYSTEM1 / SYSTEM2 collapse to **simulation budget** (depth / branching), not runtime enums.
 */

import type { ExecutionDecision } from './execution-control-policy.types';

/** How much futurity the WM explores — replaces categorical “execution modes”. */
export interface SimulationBudget {
  /** Rollout steps (shallow ≈ former fast path). */
  rolloutDepth: number;
  /** Parallel hypotheticals (1 ≈ single trace; >1 ≈ multi-branch). */
  branchCount: number;
  /** Optional constraint templates (former state-machine = restricted τ set). */
  trajectoryFamily?: 'UNCONSTRAINED' | 'WORKFLOW_CONSTRAINED';
}

/** One latent step in a predicted rollout (compress ETK / planner steps later). */
export interface PredictedTrajectoryStep {
  stepIndex: number;
  /** Opaque latent tag — tool name, phase, etc. */
  kind?: string;
  /** Scalar uncertainty or auxiliary prediction at this step. */
  stepVariance?: number;
}

/** A single WM hypothesis about the future. */
export interface PredictedTrajectory {
  id: string;
  /** Model posterior mass for this τ (Σ p_i ≈ 1 across bundle). */
  probability: number;
  simulationBudget: SimulationBudget;
  steps: PredictedTrajectoryStep[];
  /** Outcome head predictions — training targets for U(τ). */
  predictedReward: number;
  predictedRisk: number;
  predictedLatencyMs: number;
  predictedEntropy: number;
}

/** WMθ output: distribution over futures conditioned on (state_t, optional action probe). */
export interface WorldModelPredictionBundle {
  queryId: string;
  /** Optional embedding / checkpoint id for WM version. */
  worldModelVersion?: string;
  trajectories: PredictedTrajectory[];
}

/** Weights for closed-form utility (proxy for learned U_φ later). */
export interface TrajectoryUtilityWeights {
  reward: number;
  risk: number;
  entropy: number;
  latency: number;
}

export interface TrajectoryUtilityBreakdown {
  score: number;
  components: {
    rewardTerm: number;
    riskPenalty: number;
    entropyPenalty: number;
    latencyPenalty: number;
  };
}

/**
 * ECPS over futures: pick concrete execution plan after comparing τ*.
 * `proposedDecision` is the action implied by the winning rollout (filled by WM head or policy wrapper).
 */
export interface PredictiveEcpsSelection {
  winningTrajectoryId: string;
  utility: TrajectoryUtilityBreakdown;
  /** Materialized ECPS output for the router — authoritative after predictive stage. */
  decision: ExecutionDecision;
}

/** Replay as trajectory supervisor: align predicted vs observed ETK. */
export interface TrajectoryReplaySupervision {
  predictedTrajectoryId: string;
  observedTraceId: string;
  /** Scalar divergence proxy — semantic / energy distance hooks live here. */
  trajectoryDivergence: number;
  /** WM loss signal direction for updates. */
  suggestedWorldModelCorrection?: 'UP_WEIGHT_BRANCH' | 'DOWN_WEIGHT_BRANCH' | 'RECALIBRATE_UNCERTAINTY';
}
