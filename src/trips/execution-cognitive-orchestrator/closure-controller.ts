/**
 * ECO–Neptune closure policy — decides whether post-cognitive state warrants a second Neptune repair pass.
 */

import type { TripWorldState } from '../decision/world-model';
import type { NeptuneRepairResult } from '../decision/strategies/neptune';
import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';
import type {
  EcoClosureDigestSlice,
  EcoClosurePolicy,
  EcoNeptuneClosureEvaluation,
  EcoOrchestrationDigest,
} from './execution-cognitive-orchestrator.types';

/** Defaults aligned with §Closure Decision (tunable via {@link EcoClosurePolicy}). */
export const DEFAULT_ECO_CLOSURE_THRESHOLDS: {
  driftMax: number;
  stabilityMin: number;
  convergenceMin: number;
} = {
  driftMax: 0.35,
  stabilityMin: 0.7,
  convergenceMin: 0.6,
};

export type {
  EcoClosurePolicy,
  EcoClosureDigestSlice,
  EcoNeptuneClosureEvaluation,
} from './execution-cognitive-orchestrator.types';

export interface EcoOrchestrationResultLike {
  neptuneResult: NeptuneRepairResult;
  digest: EcoOrchestrationDigest;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function populationVariance(xs: number[]): number {
  if (xs.length <= 1) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
}

function overlayExecutableRatio(state: TripWorldState): number {
  const frames = state.signals.executionOverlayFrames ?? [];
  if (!frames.length) return 1;
  let ok = 0;
  for (const f of frames) {
    if (f.finalExecutionState === 'EXECUTABLE') ok += 1;
  }
  return ok / frames.length;
}

/** Composite drift: P10 magnitude + P8 regret spread + P7 semantic cohort spread. */
export function computeEcoDriftScore(
  proof: ExecutionProof | undefined,
  digest: EcoOrchestrationDigest,
): number {
  const driftP10 = proof?.driftScore ?? digest.p10DriftScore ?? 0;
  const regrets = proof?.regretDistribution;
  const regretVar = regrets?.length ? populationVariance(regrets) : 0;
  const regretSpread = clamp01(Math.min(1, regretVar * 8));
  const semVar = proof?.semanticVariance ?? 0;
  const p7Spread = clamp01(Math.min(1, semVar * 5));

  return clamp01(0.45 * driftP10 + 0.35 * regretSpread + 0.2 * p7Spread);
}

/** Blended stability: proof stability (P10) + overlay execution consistency. */
export function computeEcoStabilityScore(
  proof: ExecutionProof | undefined,
  state: TripWorldState,
): number {
  const proofStab = proof?.stabilityScore ?? 0.82;
  const exeRatio = overlayExecutableRatio(state);
  return clamp01(0.72 * proofStab + 0.28 * exeRatio);
}

/** Semantic convergence: cohort agreement (P7) + IR run health. */
export function computeSemanticConvergence(
  proof: ExecutionProof | undefined,
  neptuneResult: NeptuneRepairResult,
): number {
  const agreement = proof?.replicaAgreementScore ?? 1;
  const irConsistency = neptuneResult.irVm.ok ? 1 : 0.38;
  return clamp01(0.55 * agreement + 0.45 * irConsistency);
}

function resolveThresholds(policy?: EcoClosurePolicy | null) {
  return {
    driftMax: policy?.driftMax ?? DEFAULT_ECO_CLOSURE_THRESHOLDS.driftMax,
    stabilityMin: policy?.stabilityMin ?? DEFAULT_ECO_CLOSURE_THRESHOLDS.stabilityMin,
    convergenceMin: policy?.convergenceMin ?? DEFAULT_ECO_CLOSURE_THRESHOLDS.convergenceMin,
  };
}

export function shouldRerunNeptune(
  metrics: Pick<EcoNeptuneClosureEvaluation, 'ecoDriftScore' | 'stabilityScore' | 'semanticConvergence'>,
  thresholds = DEFAULT_ECO_CLOSURE_THRESHOLDS,
): boolean {
  const t = {
    driftMax: thresholds.driftMax,
    stabilityMin: thresholds.stabilityMin,
    convergenceMin: thresholds.convergenceMin,
  };
  return (
    metrics.ecoDriftScore > t.driftMax ||
    metrics.stabilityScore < t.stabilityMin ||
    metrics.semanticConvergence < t.convergenceMin
  );
}

export function evaluateEcoNeptuneClosure(
  state: TripWorldState,
  ecoResult: EcoOrchestrationResultLike,
  policyOverrides?: EcoClosurePolicy | null,
): EcoNeptuneClosureEvaluation {
  const proof = ecoResult.neptuneResult.executionProof;
  const digest = ecoResult.digest;
  const neptuneResult = ecoResult.neptuneResult;
  const thresholds = resolveThresholds(policyOverrides ?? state.policies?.ecoClosure ?? undefined);

  const ecoDriftScore = computeEcoDriftScore(proof, digest);
  const stabilityScore = computeEcoStabilityScore(proof, state);
  const semanticConvergence = computeSemanticConvergence(proof, neptuneResult);

  const metrics = { ecoDriftScore, stabilityScore, semanticConvergence };
  const unstable = shouldRerunNeptune(metrics, thresholds);
  const reasons: string[] = [];
  if (metrics.ecoDriftScore > thresholds.driftMax) {
    reasons.push(`ecoDriftScore>${thresholds.driftMax}`);
  }
  if (metrics.stabilityScore < thresholds.stabilityMin) {
    reasons.push(`stabilityScore<${thresholds.stabilityMin}`);
  }
  if (metrics.semanticConvergence < thresholds.convergenceMin) {
    reasons.push(`semanticConvergence<${thresholds.convergenceMin}`);
  }

  return {
    ecoDriftScore,
    stabilityScore,
    semanticConvergence,
    shouldRerunNeptune: unstable,
    reasons,
    thresholds,
  };
}

export function isNeptuneRetryAllowed(state: TripWorldState): boolean {
  if (state.policies?.ecoClosure?.allowNeptuneRetry === true) {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.TRIP_ECO_CLOSURE_NEPTUNE_RETRY === '1') {
    return true;
  }
  return false;
}

export function mergeEcoClosureIntoDigest(
  digest: EcoOrchestrationDigest,
  slice: EcoClosureDigestSlice,
): EcoOrchestrationDigest {
  return {
    ...digest,
    ecoClosure: slice,
  };
}
