/**
 * DecisionEpisodeV1 + outcome reconciliation → KnowledgeDecisionCase.
 * Does NOT invent a third decision runtime — pure projection.
 */

import type { DecisionEpisodeV1 } from '../../travel-memory/episode/decision-episode.types';
import {
  KNOWLEDGE_DECISION_CASE_SCHEMA,
  type KnowledgeDecisionCase,
  type KnowledgeDecisionOutcomeLabel,
  type KnowledgeDecisionRegret,
} from '../contracts/knowledge-decision-case.types';

export type ProjectEpisodeToCaseInput = {
  episode: DecisionEpisodeV1;
  /** ISO country; default IS for Iceland pack demos */
  country?: string;
  situationSnapshotId?: string | null;
  constraintIds?: string[];
  evidence?: KnowledgeDecisionCase['evidence'];
  userGoal?: string;
  durable?: boolean;
  projectedAt?: string;
};

function normalizeRegret(raw: number | string | null | undefined): KnowledgeDecisionRegret {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const u = raw.toUpperCase();
    if (u === 'LOW' || u === 'MEDIUM' || u === 'HIGH') return u;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return normalizeRegret(n);
  }
  if (raw >= 0.66) return 'HIGH';
  if (raw >= 0.33) return 'MEDIUM';
  return 'LOW';
}

function outcomeLabel(episode: DecisionEpisodeV1): KnowledgeDecisionOutcomeLabel {
  if (!episode.outcome) return 'PENDING';
  if (episode.outcome.safetyIncident) return 'FAILURE';
  if (episode.outcome.completed === false) return 'FAILURE';
  if (episode.outcome.completed === true) {
    const regret = normalizeRegret(episode.reflection?.decisionRegret);
    if (regret === 'HIGH') return 'PARTIAL';
    return 'SUCCESS';
  }
  if (episode.outcome.status) {
    const s = episode.outcome.status.toUpperCase();
    if (s.includes('FAIL') || s.includes('CANCEL')) return 'FAILURE';
    if (s.includes('PARTIAL') || s.includes('DELAY')) return 'PARTIAL';
    if (s.includes('OK') || s.includes('SUCCESS') || s.includes('DONE')) return 'SUCCESS';
  }
  return 'UNKNOWN';
}

function inferRiskType(episode: DecisionEpisodeV1): string | null {
  if (episode.outcome?.safetyIncident) return 'SAFETY';
  const wr = episode.context.weatherRisk?.toUpperCase();
  if (wr && wr !== 'LOW' && wr !== 'NONE') return 'WEATHER';
  if (
    episode.outcome?.fatigue &&
    String(episode.outcome.fatigue).toUpperCase() !== 'LOW'
  ) {
    return 'FATIGUE';
  }
  if ((episode.outcome?.scheduleDelayMinutes ?? 0) > 45) return 'SCHEDULE';
  if (episode.decision.type.toUpperCase().includes('F_ROAD')) return 'F_ROAD';
  if (episode.decision.type.toUpperCase().includes('WEATHER')) return 'WEATHER';
  return null;
}

function situationTags(episode: DecisionEpisodeV1, country: string): string[] {
  const tags = new Set<string>();
  tags.add(`country:${country.toUpperCase()}`);
  tags.add(`decision:${episode.decision.type}`);
  if (episode.context.weatherRisk) {
    tags.add(`weather:${episode.context.weatherRisk}`);
  }
  if (episode.context.day != null) tags.add(`day:${episode.context.day}`);
  if (episode.context.worldStateNote) {
    tags.add(
      `world:${episode.context.worldStateNote.slice(0, 48).replace(/\s+/g, '_')}`,
    );
  }
  const risk = inferRiskType(episode);
  if (risk) tags.add(`risk:${risk}`);
  tags.add(`choice:${episode.userAction.type}`);
  return [...tags];
}

function confidenceFromEpisode(episode: DecisionEpisodeV1): number {
  let c = 0.55;
  if (episode.outcome) c += 0.2;
  if (episode.reflection?.decisionRegret != null) c += 0.1;
  if (episode.sourceRefs?.cgusDecisionId) c += 0.05;
  return Math.min(0.95, c);
}

/**
 * Project a DecisionEpisode into a durable Knowledge DecisionCase.
 */
export function projectEpisodeToKnowledgeCase(
  input: ProjectEpisodeToCaseInput,
): KnowledgeDecisionCase {
  const { episode } = input;
  const country = (input.country ?? 'IS').toUpperCase();
  const recommended =
    episode.decision.recommended ?? episode.decision.alternatives[0] ?? undefined;
  const selected = episode.userAction.selected ?? undefined;

  return {
    schemaId: KNOWLEDGE_DECISION_CASE_SCHEMA,
    version: 1,
    caseId: `kdc_${episode.episodeId}`,
    episodeId: episode.episodeId,
    tripId: episode.context.tripId,
    country,
    decisionType: episode.decision.type,
    situationTags: situationTags(episode, country),
    riskType: inferRiskType(episode),
    situationSnapshotId: input.situationSnapshotId ?? null,
    userGoal: input.userGoal,
    constraintIds: input.constraintIds ?? [],
    evidence: input.evidence ?? [],
    options: episode.decision.alternatives.map((a, i) => ({
      optionId: `opt_${i}_${a}`.slice(0, 64),
      summary: a,
    })),
    recommendedOptionId: recommended
      ? `opt_${episode.decision.alternatives.indexOf(recommended)}_${recommended}`.slice(
          0,
          64,
        )
      : undefined,
    userChoice: {
      action: episode.userAction.type,
      selected,
      reason: episode.userAction.reason ?? undefined,
    },
    appliedAction: selected ?? recommended,
    outcome: {
      label: outcomeLabel(episode),
      raw: episode.outcome
        ? (episode.outcome as unknown as Record<string, unknown>)
        : undefined,
    },
    regret: normalizeRegret(episode.reflection?.decisionRegret),
    confidence: confidenceFromEpisode(episode),
    sourceRefs: episode.sourceRefs,
    projectedAt: input.projectedAt ?? new Date().toISOString(),
    durable: input.durable ?? true,
  };
}

/** SQL-style similar score (no embedding) */
export function scoreSimilarCase(
  seed: {
    country?: string;
    decisionType?: string;
    situationTags?: string[];
    riskType?: string | null;
  },
  candidate: KnowledgeDecisionCase,
): number {
  let score = 0;
  if (seed.country && candidate.country.toUpperCase() === seed.country.toUpperCase()) {
    score += 3;
  }
  if (
    seed.decisionType &&
    candidate.decisionType.toUpperCase().includes(seed.decisionType.toUpperCase())
  ) {
    score += 4;
  }
  if (seed.riskType && candidate.riskType?.toUpperCase() === seed.riskType.toUpperCase()) {
    score += 2;
  }
  if (seed.situationTags?.length) {
    const set = new Set(candidate.situationTags.map((t) => t.toUpperCase()));
    for (const t of seed.situationTags) {
      if (set.has(t.toUpperCase())) score += 1;
    }
  }
  return score;
}
