/**
 * TripRun 输入上下文 / 记忆摘要 — 写入 metadata 供 Admin 回显。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';

const MAX_PREVIEW_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 240;

export type TripRunInputContextMeta = {
  context_type: string | null;
  locale: string | null;
  timezone: string | null;
  conversation_id: string | null;
  recent_message_count: number;
  recent_messages_preview: string[];
};

export type TripRunMemorySummaryMeta = {
  snapshot_id: string;
  snapshot_version: number;
  loaded_at: string;
  layers: string[];
  has_user_profile: boolean;
  has_user_basics: boolean;
  has_active_trip_state: boolean;
  recent_decisions_count: number;
  recent_world_decisions_count: number;
  recent_trip_feedbacks_count: number;
  failure_patterns: string[];
  has_decision_ledger: boolean;
  has_wish_digest: boolean;
  has_domain_influence: boolean;
};

export function buildTripRunInputContextMeta(
  request: RouteAndRunRequestDto,
): TripRunInputContextMeta {
  const cc = request.conversation_context;
  const rawMessages = Array.isArray(cc?.recent_messages) ? cc!.recent_messages! : [];
  const preview = rawMessages
    .slice(-MAX_PREVIEW_MESSAGES)
    .map((m) => String(m ?? '').trim())
    .filter(Boolean)
    .map((m) => (m.length > MAX_MESSAGE_CHARS ? `${m.slice(0, MAX_MESSAGE_CHARS)}…` : m));

  const meta = (request.meta && typeof request.meta === 'object'
    ? (request.meta as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const conversationId =
    (typeof meta.conversation_id === 'string' && meta.conversation_id) ||
    (typeof meta.conversationId === 'string' && meta.conversationId) ||
    null;

  return {
    context_type: cc?.context_type ?? null,
    locale: cc?.locale ?? null,
    timezone: cc?.timezone ?? null,
    conversation_id: conversationId,
    recent_message_count: rawMessages.length,
    recent_messages_preview: preview,
  };
}

export function buildTripRunMemorySummaryMeta(
  memory: AgentMemoryContext,
): TripRunMemorySummaryMeta {
  return {
    snapshot_id: memory.snapshotId,
    snapshot_version: memory.snapshotVersion,
    loaded_at: memory.loadedAt,
    layers: [...(memory.observability?.layers ?? [])],
    has_user_profile: !!memory.userProfile,
    has_user_basics: !!memory.userBasics,
    has_active_trip_state: !!memory.activeTripState,
    recent_decisions_count: memory.recentDecisions?.length ?? 0,
    recent_world_decisions_count: memory.recentWorldDecisions?.length ?? 0,
    recent_trip_feedbacks_count: memory.recentTripFeedbacks?.length ?? 0,
    failure_patterns: [...(memory.failurePatterns ?? [])].slice(0, 12),
    has_decision_ledger: !!memory.decisionLedger,
    has_wish_digest: !!memory.wishConstraintDigest || !!memory.privateWishDigest,
    has_domain_influence: !!memory.domainInfluenceDigest,
  };
}

/** 写入 TripRun.metadata 的上下文/记忆块 */
export function buildTripRunContextMemoryMetadata(
  request: RouteAndRunRequestDto,
  memory?: AgentMemoryContext | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    input_context: buildTripRunInputContextMeta(request),
  };
  if (memory?.snapshotId) {
    out.memory_snapshot_id = memory.snapshotId;
    out.memory_snapshot_version = memory.snapshotVersion;
    out.memory_summary = buildTripRunMemorySummaryMeta(memory);
  }
  return out;
}
