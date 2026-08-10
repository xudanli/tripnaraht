/**
 * CGUS Outcome Loop → Decision Episode → (optional) Memory Candidate → Ledger。
 *
 * 纪律：
 * - 每次回写都记录 Episode（决策记忆原料）
 * - Action ≠ Preference；仅 Attribution + Write Policy 通过才写偏好候选
 * - 失败不得阻断 Outcome Loop 主路径（由调用方 catch）
 */

import type { CgusDecisionTraceV1 } from '../../trips/decision/optimization/cgus-decision-trace.types';
import type { CgusOutcomeLoopWriteKind } from '../../trips/decision/optimization/cgus-trip-review.util';
import type { MemoryLedgerStore } from '../ledger/memory-ledger.store';
import { evaluateCandidateWrite } from '../policy/memory-write-policy';
import { decisionEpisodeFromCgusTrace } from './decision-episode-from-cgus.util';
import {
  attributeOutcomeToMemoryCandidate,
  type AttributionResult,
} from './outcome-attribution.util';
import type { DecisionEpisodeV1 } from './decision-episode.types';
import type { MemoryEventV1 } from '../types/memory-event.types';

export type CgusOutcomeMemoryIngestInput = {
  ledger: MemoryLedgerStore;
  trace: CgusDecisionTraceV1;
  kind: CgusOutcomeLoopWriteKind;
  userId?: string | null;
  day?: number | null;
  weatherRisk?: string | null;
  scheduleSlackMinutes?: number | null;
  /** 已有同 decision 的 episodeId，用于 SUPERSEDE 更新 */
  previousEpisodeEventId?: string | null;
};

export type CgusOutcomeMemoryIngestResult = {
  episode: DecisionEpisodeV1;
  episodeEvent: MemoryEventV1;
  attribution: AttributionResult | null;
  candidateEvent: MemoryEventV1 | null;
  candidateSkippedReason?: string;
};

/**
 * 将一次 CGUS Outcome Loop 回写摄入 Travel Memory Ledger。
 */
export function ingestCgusOutcomeIntoMemoryLedger(
  input: CgusOutcomeMemoryIngestInput,
): CgusOutcomeMemoryIngestResult {
  const episode = decisionEpisodeFromCgusTrace({
    trace: input.trace,
    day: input.day,
    weatherRisk: input.weatherRisk,
    scheduleSlackMinutes: input.scheduleSlackMinutes,
  });

  const tripId = input.trace.trip_id;
  const subjectId = input.userId?.trim() || tripId;

  const episodeEvent = input.ledger.append({
    op: input.previousEpisodeEventId ? 'SUPERSEDE' : 'ADD',
    subject: { type: input.userId ? 'USER' : 'TRIP', id: subjectId },
    memoryType: 'DECISION_EPISODE_REF',
    predicate: `decision.episode.${input.trace.decision_type}`,
    value: {
      episode,
      writeKind: input.kind,
      decisionId: input.trace.decision_id,
    },
    scope: 'DECISION',
    source: {
      type: 'DECISION_OUTCOME',
      decisionId: input.trace.decision_id,
      episodeId: episode.episodeId,
      note: `cgus_outcome_loop:${input.kind}`,
    },
    confidence: 1,
    status: 'ACTIVE',
    supersedesEventId: input.previousEpisodeEventId ?? null,
  });

  // 仅当已有 outcome 时尝试归因；action-only / diagnosis-only 不升偏好
  let attribution: AttributionResult | null = null;
  let candidateEvent: MemoryEventV1 | null = null;
  let candidateSkippedReason: string | undefined;

  const hasOutcome = !!input.trace.actual_outcome && !!input.trace.user_action;
  if (!hasOutcome) {
    candidateSkippedReason = 'awaiting_outcome_or_action';
    return {
      episode,
      episodeEvent,
      attribution: null,
      candidateEvent: null,
      candidateSkippedReason,
    };
  }

  attribution = attributeOutcomeToMemoryCandidate(episode);
  if (!attribution.candidate) {
    candidateSkippedReason = attribution.verdict;
    return {
      episode,
      episodeEvent,
      attribution,
      candidateEvent: null,
      candidateSkippedReason,
    };
  }

  const policy = evaluateCandidateWrite(attribution.candidate);
  if (policy.allow === false) {
    candidateSkippedReason = policy.reason;
    return {
      episode,
      episodeEvent,
      attribution,
      candidateEvent: null,
      candidateSkippedReason,
    };
  }

  // 只写 CANDIDATE（含 AttributionConfidence）；禁止 Episode→Preference
  candidateEvent = input.ledger.append({
    op: policy.op,
    subject: { type: input.userId ? 'USER' : 'TRIP', id: subjectId },
    memoryType: 'PREFERENCE',
    predicate: attribution.candidate.predicate,
    value: {
      candidateValue: attribution.candidate.value,
      attributionConfidence: attribution.attributionConfidence,
      profileEligible: false,
    },
    scope: input.userId ? 'GLOBAL_USER' : 'TRIP',
    source: {
      type: attribution.candidate.sourceType,
      decisionId: input.trace.decision_id,
      episodeId: episode.episodeId,
      note: attribution.candidate.attributionNote,
    },
    confidence: policy.confidence,
    status: 'CANDIDATE',
  });

  // 同步 OUTCOME_REF（审计原料，非偏好）
  input.ledger.append({
    op: 'ADD',
    subject: { type: 'TRIP', id: tripId },
    memoryType: 'OUTCOME_REF',
    predicate: `decision.outcome.${input.trace.decision_id}`,
    value: {
      episodeId: episode.episodeId,
      userAction: episode.userAction,
      outcome: episode.outcome,
      reflection: episode.reflection,
    },
    scope: 'DECISION',
    source: {
      type: 'DECISION_OUTCOME',
      decisionId: input.trace.decision_id,
      episodeId: episode.episodeId,
    },
    confidence: 1,
    status: 'ACTIVE',
  });

  return {
    episode,
    episodeEvent,
    attribution,
    candidateEvent,
    candidateSkippedReason,
  };
}
