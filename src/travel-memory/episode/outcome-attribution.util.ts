/**
 * Outcome Attribution — Action ≠ Preference；原因 ≠ 结果。
 *
 * Decision Episode → Outcome → CausalAttribution → PreferenceSignal
 * → AttributionConfidence(CANDIDATE) → Promotion → QUALIFIED → ACTIVE
 *
 * 禁止：Episode → Preference；环境问题污染成人的问题。
 */

import type { DecisionEpisodeV1 } from './decision-episode.types';
import type { MemorySourceType } from '../types/memory-event.types';
import type { DecisionAttributionConfidenceV1 } from './decision-attribution-confidence.types';
import { accumulateAttributionEvidence } from './attribution-promotion.util';
import {
  estimateCausalAttribution,
  type DecisionOutcomePolarity,
} from './causal-attribution.types';

export type AttributionVerdict =
  | 'NO_PREFERENCE_SIGNAL'
  | 'WEAK_SIGNAL_KEEP_EPISODE_ONLY'
  | 'SITUATIONAL_NOT_PREFERENCE'
  | 'CANDIDATE_INFERENCE'
  | 'EXPLICIT_CONFIRMATION_REQUIRED';

export type MemoryCandidateDraft = {
  predicate: string;
  value: unknown;
  confidence: number;
  sourceType: MemorySourceType;
  status: 'CANDIDATE';
  episodeId: string;
  attributionNote: string;
  candidateType: string;
};

export type AttributionResult = {
  verdict: AttributionVerdict;
  candidate: MemoryCandidateDraft | null;
  attributionConfidence: DecisionAttributionConfidenceV1 | null;
  reasons: string[];
};

function regretScore(episode: DecisionEpisodeV1): number | null {
  const r = episode.reflection?.decisionRegret;
  if (typeof r === 'number') return r;
  return null;
}

function polarityFromEpisode(episode: DecisionEpisodeV1): DecisionOutcomePolarity {
  const regret = regretScore(episode);
  if (episode.outcome?.safetyIncident) return 'NEGATIVE';
  if (regret != null && regret >= 0.55) return 'NEGATIVE';
  if (episode.outcome?.completed === false) return 'NEGATIVE';
  if (episode.userAction.type === 'OVERRIDE' && (regret == null || regret < 0.55)) {
    return 'MIXED';
  }
  if (episode.outcome?.completed) return 'POSITIVE';
  return 'UNKNOWN';
}

/**
 * 从单次 Episode 归因：最多产生 CANDIDATE；情境主导则禁止偏好信号。
 */
export function attributeOutcomeToMemoryCandidate(
  episode: DecisionEpisodeV1,
  previous?: DecisionAttributionConfidenceV1 | null,
): AttributionResult {
  const reasons: string[] = [];
  const causal = estimateCausalAttribution({
    outcomePolarity: polarityFromEpisode(episode),
    weatherRisk: episode.context.weatherRisk,
    scheduleDelayMinutes: episode.outcome?.scheduleDelayMinutes,
    fatigue: episode.outcome?.fatigue,
    safetyIncident: episode.outcome?.safetyIncident,
    overrideReason: episode.userAction.reason,
  });

  const action = episode.userAction.type;
  if (action === 'NO_ACTION' || action === 'REJECT_ALL') {
    reasons.push('no_positive_choice');
    reasons.push('reject_is_not_dislike_without_attribution');
    return {
      verdict: 'NO_PREFERENCE_SIGNAL',
      candidate: null,
      attributionConfidence: null,
      reasons,
    };
  }

  if (action === 'OVERRIDE') {
    reasons.push('override_is_not_preference');
    if (causal.userPreferenceSignal.situationalDominant) {
      reasons.push('situational_dominant');
      return {
        verdict: 'SITUATIONAL_NOT_PREFERENCE',
        candidate: null,
        attributionConfidence: null,
        reasons,
      };
    }
    reasons.push('need_repeat_pattern_across_episodes');
    return {
      verdict: 'WEAK_SIGNAL_KEEP_EPISODE_ONLY',
      candidate: null,
      attributionConfidence: null,
      reasons,
    };
  }

  if (!episode.outcome) {
    reasons.push('missing_outcome');
    return {
      verdict: 'WEAK_SIGNAL_KEEP_EPISODE_ONLY',
      candidate: null,
      attributionConfidence: null,
      reasons,
    };
  }

  if (causal.userPreferenceSignal.situationalDominant) {
    reasons.push('environment_explains_outcome');
    reasons.push(
      `top_factor=${causal.causalFactors[0]?.factor}:${causal.causalFactors[0]?.weight}`,
    );
    return {
      verdict: 'SITUATIONAL_NOT_PREFERENCE',
      candidate: null,
      attributionConfidence: accumulateAttributionEvidence({
        previous,
        candidateType: 'experience_preference',
        predicate: `decision.affinity.${episode.decision.type}`,
        value: episode.userAction.selected ?? episode.decision.recommended,
        episodeId: episode.episodeId,
        decisionId: episode.sourceRefs?.cgusDecisionId,
        causalAttribution: causal,
      }),
      reasons,
    };
  }

  const regret = regretScore(episode);
  if (regret != null && regret >= 0.55) {
    reasons.push('high_or_medium_regret');
    return {
      verdict: 'WEAK_SIGNAL_KEEP_EPISODE_ONLY',
      candidate: null,
      attributionConfidence: null,
      reasons,
    };
  }

  if (episode.outcome.completed === false) {
    reasons.push('incomplete_outcome');
    return {
      verdict: 'WEAK_SIGNAL_KEEP_EPISODE_ONLY',
      candidate: null,
      attributionConfidence: null,
      reasons,
    };
  }

  if (episode.outcome.safetyIncident) {
    reasons.push('safety_incident');
    return {
      verdict: 'NO_PREFERENCE_SIGNAL',
      candidate: null,
      attributionConfidence: null,
      reasons,
    };
  }

  const selected =
    episode.userAction.selected ?? episode.decision.recommended ?? null;
  if (!selected) {
    reasons.push('no_selected_option');
    return {
      verdict: 'NO_PREFERENCE_SIGNAL',
      candidate: null,
      attributionConfidence: null,
      reasons,
    };
  }

  reasons.push('accept_with_benign_outcome');
  reasons.push('candidate_only_not_decision_context');

  const predicate = `decision.affinity.${episode.decision.type}`;
  const candidateType = 'experience_preference';
  const attributionConfidence = accumulateAttributionEvidence({
    previous,
    candidateType,
    predicate,
    value: selected,
    episodeId: episode.episodeId,
    decisionId: episode.sourceRefs?.cgusDecisionId,
    episodeWeight: 0.3,
    causalAttribution: causal,
  });

  return {
    verdict: 'CANDIDATE_INFERENCE',
    candidate: {
      predicate,
      value: selected,
      confidence: Math.min(
        attributionConfidence.confidence,
        causal.userPreferenceSignal.confidence + 0.15,
      ),
      sourceType: 'DECISION_OUTCOME',
      status: 'CANDIDATE',
      episodeId: episode.episodeId,
      attributionNote:
        'ACCEPT + completed + low regret + non-situational → CANDIDATE only',
      candidateType,
    },
    attributionConfidence,
    reasons,
  };
}
