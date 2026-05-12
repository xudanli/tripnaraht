import type { ReplayEligibilityClass } from '../contracts/replay-artifact-kinds.types';
import type {
  ArtifactReplayConfidence,
  ReplayConfidenceBand,
} from '../contracts/artifact-replay-confidence.types';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';
import type { RuntimeExecutionAnomaly } from '../contracts/runtime-execution-profile.validation.types';

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/** Default τ for exponential decay (ms); override with `REPLAY_CONFIDENCE_DECAY_TAU_MS`. */
function decayTauMs(): number {
  const raw = process.env.REPLAY_CONFIDENCE_DECAY_TAU_MS;
  const n = raw != null && String(raw).trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 4 * 60 * 60 * 1000;
}

export function timeDecayFactorFromProvenance(
  generatedAt: number | undefined,
  nowMs: number = Date.now(),
): { factor: number; provenanceAgeMs?: number } {
  if (generatedAt == null || !Number.isFinite(generatedAt)) {
    return { factor: 1 };
  }
  const provenanceAgeMs = Math.max(0, nowMs - generatedAt);
  const tau = decayTauMs();
  const factor = Math.exp(-provenanceAgeMs / tau);
  return { factor, provenanceAgeMs };
}

export function sumAnomalyPenalty(anomalies: RuntimeExecutionAnomaly[] | undefined): number {
  if (!anomalies?.length) return 0;
  let p = 0;
  for (const a of anomalies) {
    if (a.severity === 'ERROR') p += 0.22;
    else if (a.severity === 'WARNING') p += 0.08;
    else p += 0.03;
  }
  return Math.min(p, 0.65);
}

function eligibilityPrior(eligibility: ReplayEligibilityClass): number {
  if (eligibility === 'FULL') return 1;
  if (eligibility === 'PARTIAL') return 0.62;
  return 0.06;
}

function scoreToBand(score: number, eligibility: ReplayEligibilityClass): ReplayConfidenceBand {
  if (eligibility === 'NON_REPLAYABLE') return 'INVALID';
  if (score < 0.22) return 'LOW';
  if (score < 0.52) return 'MEDIUM';
  return 'HIGH';
}

export function computeArtifactReplayConfidence(params: {
  replayEligibility: ReplayEligibilityClass;
  provenance: ReplayProvenance;
  runtimeExecutionAnomalies?: RuntimeExecutionAnomaly[] | undefined;
  nowMs?: number;
}): ArtifactReplayConfidence {
  const { replayEligibility, provenance, runtimeExecutionAnomalies, nowMs } = params;
  const prior = eligibilityPrior(replayEligibility);
  const { factor: timeDecayFactor, provenanceAgeMs } = timeDecayFactorFromProvenance(
    provenance.generatedAt,
    nowMs,
  );
  const anomalyPenalty = sumAnomalyPenalty(runtimeExecutionAnomalies);
  const score = clamp01(prior * timeDecayFactor - anomalyPenalty);

  return {
    score,
    band: scoreToBand(score, replayEligibility),
    factors: {
      eligibilityPrior: prior,
      anomalyPenalty,
      timeDecayFactor,
      ...(provenanceAgeMs != null ? { provenanceAgeMs } : {}),
    },
  };
}
