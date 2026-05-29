/**
 * Context Package 因果缓存：Key 编码、高危阶段判定、选项归一化。
 */
import type { ContextPackageOptions } from '../types/context-package.types';

/** 进程级 L1 兜底 TTL（同请求多 Agent 并发复用；跨请求靠 version key 隔离） */
export const CONTEXT_L1_PROCESS_FALLBACK_TTL_MS = 2 * 1000;

/** 含 planDraft / 环境事实的高危阶段：跳过 L2，避免跨 Tick 脏读 */
export const CONTEXT_CACHE_L2_BYPASS_PHASES = new Set([
  'STATE_UPDATE',
  'PLAN_GEN',
  'RESEARCH',
]);

/** 动态块 L2 TTL（秒）；仅用于非 bypass 阶段且含 tripId 的包 */
export const CONTEXT_L2_DYNAMIC_TTL_SECONDS = 5;

/** 静态知识块 L2 TTL（秒） */
export const CONTEXT_L2_STATIC_TTL_SECONDS = 15 * 60;

export type CausalContextBuildFields = {
  tripId: string;
  dsoVersion: number | 'none';
  requestId: string;
  daySegment: string;
};

export function simpleContextQueryHash(query: string): string {
  const queryText = query.substring(0, 100).trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < queryText.length; i++) {
    const char = queryText.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash;
  }
  return Math.abs(hash).toString(36);
}

export function resolveCausalContextFields(
  options: ContextPackageOptions,
  alsRequestId?: string | null,
): CausalContextBuildFields {
  const tripId = String(options.tripId ?? '').trim() || 'none';
  const requestId = String(options.requestId ?? alsRequestId ?? '').trim() || 'none';
  const dsoVersion =
    options.dsoVersion !== undefined && Number.isFinite(options.dsoVersion)
      ? Math.max(0, Math.floor(options.dsoVersion))
      : 'none';
  const daySegment =
    options.targetDayIndex !== undefined && Number.isFinite(options.targetDayIndex)
      ? `day:${Math.floor(options.targetDayIndex)}`
      : 'all';
  return { tripId, dsoVersion, requestId, daySegment };
}

/**
 * 因果栅栏缓存 Key（与 Redis 前缀 `context_package:` 拼接使用）。
 */
export function buildCausalContextCacheKey(options: ContextPackageOptions, alsRequestId?: string | null): string {
  const topics = options.requiredTopics?.slice().sort().join(',') || '';
  const excludeTopics = options.excludeTopics?.slice().sort().join(',') || '';
  const includePrivate = options.includePrivate ? 'true' : 'false';
  const destCode = options.destinationCountryCode || 'none';
  const nat = options.travelerNationality?.toUpperCase() || 'none';
  const { tripId, dsoVersion, requestId, daySegment } = resolveCausalContextFields(options, alsRequestId);
  const queryHash = simpleContextQueryHash(options.userQuery ?? '');
  const verSeg = dsoVersion === 'none' ? 'none' : String(dsoVersion);

  return [
    `trip:${tripId}`,
    `ver:${verSeg}`,
    `req:${requestId}`,
    daySegment,
    `phase:${options.phase}`,
    `agent:${options.agent}`,
    `dest:${destCode}`,
    `nat:${nat}`,
    `topics:${topics}`,
    `excludeTopics:${excludeTopics}`,
    `budget:${options.tokenBudget ?? 3600}`,
    `includePrivate:${includePrivate}`,
    `qHash:${queryHash}`,
  ].join(':');
}

export function isHighRiskContextPhase(phase: string | undefined): boolean {
  const p = String(phase ?? '').trim().toUpperCase();
  return CONTEXT_CACHE_L2_BYPASS_PHASES.has(p);
}

/** 擦除匹配 `trip:{id}:ver:{version}:` 的进程内缓存条目 */
export function sweepMemoryCacheByTripVersionPrefix(
  cache: Map<string, { package: unknown; timestamp: number }>,
  tripId: string,
  supersededVersion: number,
): number {
  const prefix = `trip:${tripId}:ver:${supersededVersion}:`;
  let removed = 0;
  for (const key of [...cache.keys()]) {
    if (key.includes(prefix)) {
      cache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function sweepInFlightBuildsByTripVersionPrefix(
  inFlight: Map<string, Promise<unknown>>,
  tripId: string,
  supersededVersion: number,
): number {
  const prefix = `trip:${tripId}:ver:${supersededVersion}:`;
  let removed = 0;
  for (const key of [...inFlight.keys()]) {
    if (key.includes(prefix)) {
      inFlight.delete(key);
      removed += 1;
    }
  }
  return removed;
}
