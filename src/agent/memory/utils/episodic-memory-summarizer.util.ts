/**
 * State P3：情景 memory 异步 summarizer — 长 session 压缩 + token 可观测。
 */

import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { TripTaskMemory } from '../../context-engine/interfaces/trip-task-memory.interface';

function estimateMessageTokens(text: string): number {
  return Math.ceil(String(text ?? '').length / 4);
}

export interface EpisodicSummaryV1 {
  schemaId: 'tripnara.episodic_summary@v1';
  version: 1;
  summary: string;
  source_message_count: number;
  tokens_before: number;
  tokens_after: number;
  updated_at: string;
  summary_source?: 'deterministic' | 'llm';
}

export interface EpisodicSummarizerObservabilityV1 {
  schemaId: 'tripnara.episodic_summarizer@v1';
  version: 1;
  enabled: boolean;
  scheduled: boolean;
  skip_reason?: 'disabled' | 'below_threshold' | 'no_trip_id' | 'in_flight';
  compaction_applied: boolean;
  conversation_tokens_before: number | null;
  conversation_tokens_after: number | null;
  episodic_summary_present: boolean;
  summary_source?: 'deterministic' | 'llm' | null;
}

export type RouteAndRunEpisodicCarrier = RouteAndRunRequestDto & {
  __episodicSummarizerIngressV1?: EpisodicSummarizerObservabilityV1;
};

export const EPISODIC_SUMMARY_CONSTRAINT_KEY = 'episodic_summary_v1';

export function parseEpisodicSummarizerEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.HARNESS_EPISODIC_SUMMARIZER ?? env.EPISODIC_MEMORY_SUMMARIZER_ENABLED;
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function parseEpisodicSummarizeMinMessages(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.HARNESS_EPISODIC_SUMMARIZE_MIN_MESSAGES?.trim();
  const n = Number(raw ?? '8');
  if (!Number.isFinite(n) || n < 2) return 8;
  return Math.floor(n);
}

export function parseEpisodicCompactionKeepRecent(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.HARNESS_EPISODIC_COMPACTION_KEEP_RECENT?.trim();
  const n = Number(raw ?? '4');
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.floor(n);
}

export function readEpisodicSummaryFromTripTask(
  memory: TripTaskMemory | null | undefined,
): EpisodicSummaryV1 | null {
  const raw = memory?.constraints?.[EPISODIC_SUMMARY_CONSTRAINT_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Partial<EpisodicSummaryV1>;
  if (o.schemaId !== 'tripnara.episodic_summary@v1') return null;
  if (typeof o.summary !== 'string' || !o.summary.trim()) return null;
  return {
    schemaId: 'tripnara.episodic_summary@v1',
    version: 1,
    summary: o.summary.trim(),
    source_message_count: Number(o.source_message_count ?? 0) || 0,
    tokens_before: Number(o.tokens_before ?? 0) || 0,
    tokens_after: Number(o.tokens_after ?? 0) || 0,
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : new Date().toISOString(),
  };
}

export function estimateConversationTokens(messages: readonly string[] | undefined | null): number {
  if (!messages?.length) return 0;
  return messages.reduce((sum, m) => sum + estimateMessageTokens(String(m ?? '')), 0);
}

/** 确定性摘要（无 LLM 依赖；可后续替换为 async LLM 路径） */
export function buildDeterministicEpisodicSummary(messages: readonly string[]): {
  summary: string;
  tokensAfter: number;
} {
  const userLines: string[] = [];
  for (const m of messages) {
    const t = String(m ?? '').trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (lower.startsWith('user:') || lower.startsWith('用户:')) {
      userLines.push(t.replace(/^(user|用户)\s*:\s*/i, '').trim());
    } else if (!lower.startsWith('assistant:') && !lower.startsWith('助手:')) {
      userLines.push(t);
    }
  }
  const uniq: string[] = [];
  for (const line of userLines) {
    if (!uniq.includes(line)) uniq.push(line);
  }
  const capped = uniq.slice(-6);
  const body =
    capped.length > 0
      ? capped.map((l, i) => `${i + 1}. ${l.slice(0, 160)}`).join(' ')
      : messages
          .slice(0, 4)
          .map((m) => String(m).trim().slice(0, 120))
          .filter(Boolean)
          .join(' ');
  const summary = `[EpisodicSummary] 先前对话要点：${body}`.slice(0, 900);
  return { summary, tokensAfter: Math.ceil(summary.length / 4) };
}

export function shouldScheduleEpisodicSummarize(
  messages: readonly string[] | undefined | null,
  minMessages: number,
): boolean {
  return (messages?.length ?? 0) >= minMessages;
}

/**
 * 将 trip task 中的 episodic summary 应用到 conversation_context（保留最近 K 条 + 摘要前缀）。
 */
export function applyEpisodicCompactionToConversationContext(
  request: RouteAndRunRequestDto,
  episodicSummary: EpisodicSummaryV1,
  keepRecent: number,
): { applied: boolean; tokensBefore: number; tokensAfter: number } {
  const ctx = request.conversation_context;
  const raw = ctx?.recent_messages;
  if (!raw?.length) {
    return { applied: false, tokensBefore: 0, tokensAfter: 0 };
  }
  const tokensBefore = estimateConversationTokens(raw);
  const recent = raw.slice(-keepRecent);
  const prefix = `[情景摘要] ${episodicSummary.summary}`;
  const compacted = [prefix, ...recent];
  const tokensAfter = estimateConversationTokens(compacted);
  if (tokensAfter >= tokensBefore) {
    return { applied: false, tokensBefore, tokensAfter: tokensBefore };
  }
  request.conversation_context = {
    ...(ctx ?? {}),
    recent_messages: compacted,
  };
  return { applied: true, tokensBefore, tokensAfter };
}

export function buildEpisodicSummarizerObservability(params: {
  enabled: boolean;
  scheduled: boolean;
  skipReason?: EpisodicSummarizerObservabilityV1['skip_reason'];
  compactionApplied: boolean;
  conversationTokensBefore?: number | null;
  conversationTokensAfter?: number | null;
  episodicSummaryPresent: boolean;
  summarySource?: 'deterministic' | 'llm' | null;
}): EpisodicSummarizerObservabilityV1 {
  return {
    schemaId: 'tripnara.episodic_summarizer@v1',
    version: 1,
    enabled: params.enabled,
    scheduled: params.scheduled,
    skip_reason: params.skipReason,
    compaction_applied: params.compactionApplied,
    conversation_tokens_before: params.conversationTokensBefore ?? null,
    conversation_tokens_after: params.conversationTokensAfter ?? null,
    episodic_summary_present: params.episodicSummaryPresent,
    summary_source: params.summarySource ?? null,
  };
}
