import {
  CONTEXT_PROFILES,
  type ContextConsumerProfile,
  type ProfileConfig,
} from '../interfaces/context-window-profile.interface';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';

const PROFILE_ENV_KEY: Record<ContextConsumerProfile, string> = {
  intent_compiler: 'CONTEXT_WINDOW_INTENT_COMPILER_LIMIT',
  agent_telemetry: 'CONTEXT_WINDOW_AGENT_TELEMETRY_LIMIT',
  orchestrator_claude: 'CONTEXT_WINDOW_ORCHESTRATOR_CLAUDE_LIMIT',
  repair_executor: 'CONTEXT_WINDOW_REPAIR_EXECUTOR_LIMIT',
  request_dedup: 'CONTEXT_WINDOW_REQUEST_DEDUP_LIMIT',
  default: 'CONTEXT_WINDOW_DEFAULT_LIMIT',
};

/** SSOT：解析 profile 有效 limit（含 staging 环境变量覆盖） */
export function resolveContextWindowLimit(profile: ContextConsumerProfile): number {
  const base = resolveContextWindowConfig(profile).limit;
  const envKey = PROFILE_ENV_KEY[profile in CONTEXT_PROFILES ? profile : 'default'];
  const raw = process.env[envKey]?.trim();
  if (!raw) return base;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return base;
  return Math.floor(n);
}

export function resolveContextWindowConfig(profile: ContextConsumerProfile): ProfileConfig {
  if (profile in CONTEXT_PROFILES) {
    return CONTEXT_PROFILES[profile];
  }
  return CONTEXT_PROFILES.default;
}

function coerceStringMessages(messages: readonly unknown[] | undefined | null): string[] {
  if (!messages || !Array.isArray(messages)) return [];
  const out: string[] = [];
  for (const m of messages) {
    if (typeof m !== 'string') continue;
    const trimmed = m.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

/** 纯函数滑动窗口（route_and_run 消费端 SSOT） */
export function sliceRecentMessagesForProfile(
  profile: ContextConsumerProfile,
  messages: readonly string[] | undefined | null,
): string[] {
  if (!messages || !Array.isArray(messages) || messages.length === 0) return [];
  const limit = resolveContextWindowLimit(profile);
  return messages.length <= limit ? [...messages] : messages.slice(-limit);
}

/** 过滤非 string / 空行后再 slice */
export function sliceRecentMessagesSafeForProfile(
  profile: ContextConsumerProfile,
  messages: readonly unknown[] | undefined | null,
): string[] {
  return sliceRecentMessagesForProfile(profile, coerceStringMessages(messages));
}

/**
 * Execution Gateway 入口：将 `conversation_context.recent_messages` 规范到 ingress profile（默认 10 条）。
 * 与 PA 桥接 `limit: 10` 对齐；下游各 consumer 再按自身 profile 二次 slice。
 */
export function normalizeRouteAndRunConversationContextInPlace(
  request: RouteAndRunRequestDto,
  ingressProfile: ContextConsumerProfile = 'default',
): { originalSize: number; normalizedSize: number } {
  const ctx = request.conversation_context;
  const raw = ctx?.recent_messages;
  if (!raw?.length) {
    return { originalSize: 0, normalizedSize: 0 };
  }
  const normalized = sliceRecentMessagesSafeForProfile(ingressProfile, raw);
  const changed =
    normalized.length !== raw.length ||
    normalized.some((m, i) => m !== raw[i]);
  if (changed) {
    request.conversation_context = {
      ...(ctx ?? {}),
      recent_messages: normalized,
    };
  }
  return { originalSize: raw.length, normalizedSize: normalized.length };
}
