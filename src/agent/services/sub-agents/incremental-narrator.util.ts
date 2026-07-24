import type { PlanDeltaIR } from '../../contracts/plan-delta-ir.types';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { ContextBlock } from '../../context-engine/types/context-package.types';
import type {
  NarrativeDayCache,
  NarrativeIncrementalAuditV1,
} from './incremental-narrator.types';

export type AffectedDaysResolution = {
  isIncremental: boolean;
  affectedZeroBased: number[];
};

/**
 * 从 Plan Delta IR 提取本 Tick 需刷新叙述的天索引（0-based）。
 * 无 dayIndex 的全局 delta（如 FLIGHT）视为全量刷新。
 */
export function extractAffectedDayIndices(
  planDeltas: ReadonlyArray<PlanDeltaIR>,
  totalDays: number,
): AffectedDaysResolution {
  const safeTotal = Math.max(0, totalDays);
  const allDays = Array.from({ length: safeTotal }, (_, i) => i);

  if (!planDeltas.length) {
    return { isIncremental: false, affectedZeroBased: allDays };
  }

  const indices = new Set<number>();
  let hasGlobal = false;

  for (const delta of planDeltas) {
    const dayIdx = delta.target.dayIndex;
    if (dayIdx !== undefined && Number.isFinite(dayIdx) && dayIdx >= 0 && dayIdx < safeTotal) {
      indices.add(dayIdx);
    } else if (dayIdx === undefined || !Number.isFinite(dayIdx)) {
      hasGlobal = true;
    }
  }

  if (hasGlobal) {
    return { isIncremental: true, affectedZeroBased: allDays };
  }

  return {
    isIncremental: true,
    affectedZeroBased: [...indices].sort((a, b) => a - b),
  };
}

/** 从上一轮 narration 或 metadata 恢复按天叙述缓存 */
export function loadNarrativeDayCache(context: OrchestratorState): NarrativeDayCache {
  const cache: NarrativeDayCache = {};

  for (const entry of context.narration?.day_by_day_narrative ?? []) {
    if (entry.day != null && entry.narrative?.trim()) {
      cache[entry.day - 1] = entry.narrative.trim();
    }
  }

  const metaCache = context.metadata?.narrative_day_cache;
  if (metaCache && typeof metaCache === 'object' && !Array.isArray(metaCache)) {
    for (const [key, value] of Object.entries(metaCache as Record<string, unknown>)) {
      const idx = parseInt(key, 10);
      if (Number.isFinite(idx) && typeof value === 'string' && value.trim()) {
        cache[idx] = value.trim();
      }
    }
  }

  return cache;
}

export function persistNarrativeDayCache(
  context: OrchestratorState,
  cache: NarrativeDayCache,
): void {
  const serializable: Record<string, string> = {};
  for (const [idx, text] of Object.entries(cache)) {
    if (text?.trim()) {
      serializable[String(idx)] = text.trim();
    }
  }
  context.metadata = {
    ...context.metadata,
    narrative_day_cache: serializable,
  };
}

export function buildNarrativeIncrementalAudit(
  isIncremental: boolean,
  affected: number[],
  updated: number[],
  cacheHits: number,
  cacheMisses: number,
): NarrativeIncrementalAuditV1 {
  return {
    revision: 'v1',
    is_incremental: isIncremental,
    affected_days_0based: affected,
    updated_days_0based: updated,
    cache_hits: cacheHits,
    cache_misses: cacheMisses,
  };
}

/** 将 Context Package blocks 压缩为 LLM 可读上下文 */
export function formatContextBlocksForLlm(blocks: ContextBlock[], maxChars = 6000): string {
  const lines = blocks
    .filter((b) => b.visibility === 'public' && b.text?.trim())
    .sort((a, b) => b.priority - a.priority)
    .map((b) => `[${b.type}] ${b.text.trim()}`);
  const joined = lines.join('\n');
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars - 1)}…`;
}

export function isNarratorIncrementalEnabled(): boolean {
  const raw = process.env.NARRATOR_INCREMENTAL_ENABLED ?? 'true';
  return raw !== 'false' && raw !== '0';
}

export function isNarratorIncrementalLlmEnabled(): boolean {
  const raw = process.env.NARRATOR_INCREMENTAL_LLM_ENABLED ?? 'false';
  return raw === 'true' || raw === '1';
}
