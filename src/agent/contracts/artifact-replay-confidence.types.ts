/**
 * Artifact-level replay confidence / validity — control knob for equivalence, dependency propagation, scheduling.
 *
 * Orthogonal to `artifactId` (identity); combines eligibility priors, semantic anomaly penalties, and optional time decay.
 */

export type ReplayConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW' | 'INVALID';

export interface ArtifactReplayConfidenceFactors {
  /** Prior from replay eligibility before decay / anomalies (0–1). */
  eligibilityPrior: number;
  /** Subtracted after eligibility × decay (capped). */
  anomalyPenalty: number;
  /** Multiplier from provenance age vs exponential decay (1 = fresh). */
  timeDecayFactor: number;
  /** Wall-clock age of `ReplayProvenance.generatedAt` when scored (optional). */
  provenanceAgeMs?: number;
}

export interface ArtifactReplayConfidence {
  /** 0–1 aggregate; higher ⇒ safer to treat as reusable memo without recompute. */
  score: number;
  band: ReplayConfidenceBand;
  factors: ArtifactReplayConfidenceFactors;
}
