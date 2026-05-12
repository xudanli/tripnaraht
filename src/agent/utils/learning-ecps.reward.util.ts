/**
 * Reward constructor for Learning ECPS — scalar signal from traces + outcomes for policy gradients.
 *
 * Objective shape (configurable):  W − α·E_field − β·S_trace − λ·latency − μ·anomalies + γ·reuse + replay_bonus
 */

export interface LearningEcpsRewardWeights {
  /** Penalty weight on policy entropy coordinate (exploration tax). */
  alphaEntropyField: number;
  /** Penalty weight on trace-derived disorder (see cognitive thermodynamics lane). */
  betaTraceEntropy: number;
  /** Bonus for successful artifact reuse benefit. */
  gammaReuse: number;
  /** Latency penalty multiplier. */
  lambdaLatency: number;
  /** Penalty per anomaly count. */
  muAnomaly: number;
  /** Sparse bonus when replay outcome matches expectation. */
  replayMatchBonus: number;
}

export const DEFAULT_LEARNING_ECPS_REWARD_WEIGHTS: LearningEcpsRewardWeights = {
  alphaEntropyField: 0.35,
  betaTraceEntropy: 0.28,
  gammaReuse: 0.55,
  lambdaLatency: 0.0012,
  muAnomaly: 0.14,
  replayMatchBonus: 1,
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export interface LearningEcpsRewardParts {
  /** Proxy for “work” / useful computation — default 1 when no penalty. */
  workProxy: number;
  latencyMs: number;
  anomalyCount: number;
  replayOutcomeMatch?: boolean;
  reuseArtifactBenefit?: number;
  /** ECPS `features.entropy` after sampling (bounded [0,1]). */
  policyEntropyField?: number;
  /** External estimate e.g. `estimateEntropyShare` on trace (bounded [0,1]). */
  traceEntropyShare?: number;
}

/**
 * Scalar reward for one transition / rollout — suitable for advantage estimation hooks.
 */
export function constructLearningEcpsReward(
  parts: LearningEcpsRewardParts,
  weights: Partial<LearningEcpsRewardWeights> = {},
): number {
  const w = { ...DEFAULT_LEARNING_ECPS_REWARD_WEIGHTS, ...weights };

  let r = parts.workProxy;
  r -= w.lambdaLatency * Math.max(0, parts.latencyMs);
  r -= w.muAnomaly * Math.max(0, parts.anomalyCount);
  if (parts.replayOutcomeMatch === true) r += w.replayMatchBonus;

  const reuse = parts.reuseArtifactBenefit ?? 0;
  r += w.gammaReuse * clamp01(reuse);

  const pe = parts.policyEntropyField ?? 0;
  const te = parts.traceEntropyShare ?? 0;
  r -= w.alphaEntropyField * clamp01(pe);
  r -= w.betaTraceEntropy * clamp01(te);

  return r;
}
