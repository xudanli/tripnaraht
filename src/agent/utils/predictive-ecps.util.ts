import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type {
  PredictedTrajectory,
  PredictiveEcpsSelection,
  TrajectoryReplaySupervision,
  TrajectoryUtilityBreakdown,
  TrajectoryUtilityWeights,
  WorldModelPredictionBundle,
} from '../contracts/predictive-execution.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Default weights — tune toward conservative execution under uncertainty. */
export const DEFAULT_TRAJECTORY_UTILITY_WEIGHTS: TrajectoryUtilityWeights = {
  reward: 1,
  risk: 0.65,
  entropy: 0.35,
  latency: 0.00035,
};

/**
 * Utility U(τ) ≈ reward − weighted risk − weighted entropy − weighted latency.
 * Latency is raw ms scaled down to ~[0,1] via reference cap.
 */
export function trajectoryUtility(
  trajectory: PredictedTrajectory,
  weights: TrajectoryUtilityWeights = DEFAULT_TRAJECTORY_UTILITY_WEIGHTS,
  latencyCapMs: number = 120_000,
): TrajectoryUtilityBreakdown {
  const _latNorm = clamp01(trajectory.predictedLatencyMs / Math.max(1, latencyCapMs));
  const rewardTerm = weights.reward * trajectory.predictedReward;
  const riskPenalty = weights.risk * trajectory.predictedRisk;
  const entropyPenalty = weights.entropy * trajectory.predictedEntropy;
  const latencyPenalty = weights.latency * trajectory.predictedLatencyMs * (1 / Math.max(1, latencyCapMs));

  const score = rewardTerm - riskPenalty - entropyPenalty - latencyPenalty;

  return {
    score,
    components: {
      rewardTerm,
      riskPenalty,
      entropyPenalty,
      latencyPenalty,
    },
  };
}

export interface ArgmaxTrajectoryResult {
  index: number;
  trajectory: PredictedTrajectory;
  utility: TrajectoryUtilityBreakdown;
}

/** Full predictive ECPS hop: pick τ* then materialize ECPS decision via injected WM/policy head. */
export function predictiveEcpsSelectionFromRollouts(params: {
  bundle: WorldModelPredictionBundle;
  decisionFromTrajectory: (trajectory: PredictedTrajectory) => ExecutionDecision;
  weights?: TrajectoryUtilityWeights;
  latencyCapMs?: number;
}): PredictiveEcpsSelection {
  const best = argmaxTrajectoryUtility(params.bundle, params.weights, params.latencyCapMs);
  return {
    winningTrajectoryId: best.trajectory.id,
    utility: best.utility,
    decision: params.decisionFromTrajectory(best.trajectory),
  };
}

/** argmax_τ U(τ) over WM bundle — predictive ECPS core. */
export function argmaxTrajectoryUtility(
  bundle: WorldModelPredictionBundle,
  weights?: TrajectoryUtilityWeights,
  latencyCapMs?: number,
): ArgmaxTrajectoryResult {
  if (!bundle.trajectories.length) {
    throw new Error('PREDICTIVE_ECPS_EMPTY_BUNDLE');
  }
  let bestIdx = 0;
  let bestU = trajectoryUtility(bundle.trajectories[0], weights, latencyCapMs);
  for (let i = 1; i < bundle.trajectories.length; i++) {
    const u = trajectoryUtility(bundle.trajectories[i], weights, latencyCapMs);
    if (u.score > bestU.score) {
      bestIdx = i;
      bestU = u;
    }
  }
  return {
    index: bestIdx,
    trajectory: bundle.trajectories[bestIdx],
    utility: bestU,
  };
}

/** Optional: posterior-weighted expected utility E_τ[U] — diagnostics / soft selection. */
export function expectedTrajectoryUtility(
  bundle: WorldModelPredictionBundle,
  weights?: TrajectoryUtilityWeights,
  latencyCapMs?: number,
): number {
  let s = 0;
  let pSum = 0;
  for (const t of bundle.trajectories) {
    const p = Math.max(0, t.probability);
    const u = trajectoryUtility(t, weights, latencyCapMs).score;
    s += p * u;
    pSum += p;
  }
  if (pSum < 1e-9) return 0;
  return s / pSum;
}

/** Ground-truth supervision — coarse divergence proxy until semantic trajectory metrics land. */
export function trajectoryReplaySupervisionStub(params: {
  predictedTrajectoryId: string;
  observedTraceId: string;
  predictedStepCount: number;
  observedStepCount: number;
}): TrajectoryReplaySupervision {
  const trajectoryDivergence =
    Math.abs(params.predictedStepCount - params.observedStepCount) /
    Math.max(1, params.observedStepCount);
  return {
    predictedTrajectoryId: params.predictedTrajectoryId,
    observedTraceId: params.observedTraceId,
    trajectoryDivergence,
    suggestedWorldModelCorrection:
      trajectoryDivergence > 0.35 ? 'RECALIBRATE_UNCERTAINTY' : undefined,
  };
}
