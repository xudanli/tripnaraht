import type { WorldModelContext } from '../../shared/world-model.types';
import type { RoutePlanDraft } from '../../shared/world-model.types';

/**
 * Scorer invocation mode.
 * - off: CGUS does not call scorer
 * - shadow: scores attached as sidecar only; ordering unchanged
 * - active: reserved for future blended re-ranking (must remain Gate-safe)
 */
export type CandidateScorerMode = 'off' | 'shadow' | 'active';

/**
 * Partial Latent Contract snapshot derived from WorldModelContext + profile.
 * Aligns with `.claude/roles/chief-ai-scientist.md` z_env / z_user sketch; extend over time.
 */
export interface LatentContractSnapshot {
  z_user?: Partial<{
    risk_tolerance: number;
    delay_sensitivity: number;
    fatigue_limit: number;
    experience_level: number;
  }>;
  z_env?: Partial<{
    terrain_risk_01: number;
    weather_stress_01: number;
    accessibility_01: number;
  }>;
  z_state?: Partial<{
    continuity: number;
    risk_score: number;
    cost: number;
    fatigue: number;
    satisfaction_estimate: number;
  }>;
  /** Contract version for replay / debugging */
  contractVersion?: string;
}

export interface CandidateScorerCandidateSlice {
  id: string;
  feasible: boolean;
  plan?: RoutePlanDraft;
}

export interface CandidateScorerInput {
  candidates: ReadonlyArray<CandidateScorerCandidateSlice>;
  worldContext: WorldModelContext;
  latent: LatentContractSnapshot;
  mode: CandidateScorerMode;
}

/**
 * Sidecar output per candidate. Must not encode Gate verdicts (BLOCK / etc.).
 */
export interface CandidateScorerPerCandidateOutput {
  candidateId: string;
  modelVersion: string;
  personalization_score?: number;
  relevance_score?: number;
  heads?: Record<string, number>;
  evidence_refs?: string[];
}

export interface CandidateScorerBatchOutput {
  modelVersion: string;
  perCandidate: CandidateScorerPerCandidateOutput[];
}

/**
 * Optional post-ranking hook for feasible CGUS candidates only.
 */
export interface ICandidateScorer {
  score(input: CandidateScorerInput): Promise<CandidateScorerBatchOutput>;
}
