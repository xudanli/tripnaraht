import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type {
  CausalConsistencyValidation,
  CounterfactualEcpsSelection,
  CounterfactualGeneratorBundle,
  CounterfactualWorld,
} from '../contracts/counterfactual-execution.types';
import type { PredictedTrajectory, TrajectoryUtilityWeights } from '../contracts/predictive-execution.types';
import {
  DEFAULT_TRAJECTORY_UTILITY_WEIGHTS,
  trajectoryUtility,
} from './predictive-ecps.util';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** ΔU(a) = U(τ_a) − U(τ⁰) — causal uplift vs baseline (Pearl-style contrast). */
export function deltaUtilityVersusBaseline(
  intervened: PredictedTrajectory,
  baseline: PredictedTrajectory,
  weights: TrajectoryUtilityWeights = DEFAULT_TRAJECTORY_UTILITY_WEIGHTS,
  latencyCapMs: number = 120_000,
): number {
  const ui = trajectoryUtility(intervened, weights, latencyCapMs).score;
  const ub = trajectoryUtility(baseline, weights, latencyCapMs).score;
  return ui - ub;
}

export interface ArgmaxCounterfactualResult {
  world: CounterfactualWorld;
  deltaUtility: number;
  baselineUtilityScore: number;
  intervenedUtilityScore: number;
}

/** a* ≈ argmax_a ΔU(a) over intervened worlds — CEPS causal selector. */
export function argmaxCounterfactualDelta(
  bundle: CounterfactualGeneratorBundle,
  weights: TrajectoryUtilityWeights = DEFAULT_TRAJECTORY_UTILITY_WEIGHTS,
  latencyCapMs: number = 120_000,
): ArgmaxCounterfactualResult {
  if (!bundle.intervenedWorlds.length) {
    throw new Error('CEPS_EMPTY_INTERVENED_WORLDS');
  }
  const ub = trajectoryUtility(bundle.baselineWorld, weights, latencyCapMs).score;

  let best = bundle.intervenedWorlds[0];
  let bestDelta = deltaUtilityVersusBaseline(best, bundle.baselineWorld, weights, latencyCapMs);
  let bestUi = trajectoryUtility(best, weights, latencyCapMs).score;

  for (let i = 1; i < bundle.intervenedWorlds.length; i++) {
    const w = bundle.intervenedWorlds[i];
    const ui = trajectoryUtility(w, weights, latencyCapMs).score;
    const du = ui - ub;
    if (du > bestDelta) {
      best = w;
      bestDelta = du;
      bestUi = ui;
    }
  }

  return {
    world: best,
    deltaUtility: bestDelta,
    baselineUtilityScore: ub,
    intervenedUtilityScore: bestUi,
  };
}

/** Full CEPS hop: pick best do(a), map to ECPS `ExecutionDecision`. */
export function counterfactualEcpsSelection(params: {
  bundle: CounterfactualGeneratorBundle;
  decisionFromIntervenedWorld: (world: CounterfactualWorld) => ExecutionDecision;
  weights?: TrajectoryUtilityWeights;
  latencyCapMs?: number;
}): CounterfactualEcpsSelection {
  const w = params.weights ?? DEFAULT_TRAJECTORY_UTILITY_WEIGHTS;
  const cap = params.latencyCapMs ?? 120_000;
  const best = argmaxCounterfactualDelta(params.bundle, w, cap);
  const breakdown = trajectoryUtility(best.world, w, cap);

  return {
    winningInterventionId: best.world.interventionId,
    baselineUtilityScore: best.baselineUtilityScore,
    intervenedUtilityScore: best.intervenedUtilityScore,
    deltaUtility: best.deltaUtility,
    utilityBreakdown: breakdown,
    decision: params.decisionFromIntervenedWorld(best.world),
  };
}

/** Replay supervisor — coarse causal mismatch signal for CM calibration (extend with SCM residuals later). */
export function causalConsistencyReplayStub(params: {
  interventionId: string;
  predictedUtilityScore: number;
  observedUtilityProxy: number;
}): CausalConsistencyValidation {
  const inconsistency = Math.abs(params.predictedUtilityScore - params.observedUtilityProxy);
  let suggestedCalibration: CausalConsistencyValidation['suggestedCalibration'] = 'NONE';
  if (inconsistency > 0.45) suggestedCalibration = 'MODEL_DRIFT';
  else if (inconsistency > 0.2) suggestedCalibration = 'INTERVENTION_BIAS';

  return {
    interventionId: params.interventionId,
    predictedOutcomeScore: params.predictedUtilityScore,
    observedOutcomeScore: params.observedUtilityProxy,
    inconsistency: clamp01(inconsistency),
    suggestedCalibration,
  };
}
