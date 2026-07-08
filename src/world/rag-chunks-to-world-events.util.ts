/**
 * RAG chunk → WorldDomainEvent[]（路政/限流/规则类语料落地为可计算约束）
 */

import type { ChunkRetrievalResult } from '../rag/services/chunk-retrieval.service';
import type { WorldDomainEvent } from './world-constraint.pipeline';

const STRESS_CATEGORIES = new Set([
  'RULES',
  'RISK_INFO',
  'ROAD_STATUS',
  'TRAFFIC_ALERT',
  'GATE',
]);

const F_ROAD_RE = /\bF\d{2,4}\b/gi;

function normCategory(raw?: string): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

function extractRoadIds(chunk: ChunkRetrievalResult): string[] {
  const ids = new Set<string>();
  const meta = (chunk.metadata ?? {}) as Record<string, unknown>;
  for (const key of ['roadId', 'road_id', 'road_name']) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) {
      ids.add(v.trim());
    }
  }
  const structured = meta.structured_data as Record<string, unknown> | undefined;
  const fRoad = structured?.f_road_required as { roads?: unknown } | undefined;
  if (Array.isArray(fRoad?.roads)) {
    for (const r of fRoad.roads) {
      const s = String(r).trim();
      if (s) ids.add(s);
    }
  }
  const content = String(chunk.content ?? '');
  for (const m of content.matchAll(F_ROAD_RE)) {
    ids.add(m[0].toUpperCase());
  }
  return [...ids];
}

function roadStatusFromChunk(chunk: ChunkRetrievalResult, category: string): string {
  const content = String(chunk.content ?? '').toUpperCase();
  const meta = (chunk.metadata ?? {}) as Record<string, unknown>;
  const explicit = meta.status ?? meta.road_status;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }
  if (/CLOSED|IMPASSABLE|封路|关闭/.test(content)) {
    return 'CLOSED';
  }
  if (/RESTRICT|4WD|4X4|仅限/.test(content)) {
    return 'RESTRICTED_4WD';
  }
  if (/ADVISORY|DEGRAD|谨慎|限行/.test(content)) {
    return 'ADVISORY';
  }
  if (category === 'RULES' || category === 'RISK_INFO') {
    return 'ADVISORY';
  }
  return 'OPEN';
}

function weatherViolationFromChunk(chunk: ChunkRetrievalResult, category: string): 'HARD' | 'SOFT' | 'NONE' {
  const content = String(chunk.content ?? '').toUpperCase();
  if (category === 'RISK_INFO' && /STORM|BLIZZARD|飓风|暴风|极端/.test(content)) {
    return 'HARD';
  }
  if (/HARD|BLOCK|禁止|不可/.test(content)) {
    return 'HARD';
  }
  if (/WARN|RISK|谨慎|软/.test(content) || category === 'WEATHER') {
    return 'SOFT';
  }
  return 'NONE';
}

function resolveWeatherDate(
  chunk: ChunkRetrievalResult,
  fallbackDates?: string[],
): string | undefined {
  const meta = (chunk.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.date === 'string' && meta.date.trim()) {
    return meta.date.trim().slice(0, 10);
  }
  if (typeof meta.valid_from === 'string') {
    return meta.valid_from.trim().slice(0, 10);
  }
  return fallbackDates?.[0];
}

export interface RagChunksToWorldEventsOptions {
  atMs?: number;
  /** 行程日历日，用于无 chunk 日期时的天气锚定 */
  tripDates?: string[];
}

/**
 * 将 RAG 检索 chunk 转为可写入 `WorldConstraintStore` 的域事件（去重 roadId / date）。
 */
export function worldEventsFromRagChunks(
  chunks: ChunkRetrievalResult[],
  options?: RagChunksToWorldEventsOptions,
): WorldDomainEvent[] {
  const at = options?.atMs ?? Date.now();
  const events: WorldDomainEvent[] = [];
  const seenRoad = new Set<string>();
  const seenWeather = new Set<string>();

  for (const chunk of chunks) {
    const category = normCategory(chunk.category ?? undefined);
    if (!STRESS_CATEGORIES.has(category) && category !== 'WEATHER') {
      continue;
    }

    if (
      category === 'WEATHER' ||
      (category === 'RISK_INFO' &&
        /天气|WEATHER|WIND|RAIN|STORM|BLIZZARD|飓风|暴风/i.test(String(chunk.content ?? '')))
    ) {
      const date = resolveWeatherDate(chunk, options?.tripDates);
      if (!date || seenWeather.has(date)) continue;
      const violation = weatherViolationFromChunk(chunk, category);
      if (violation === 'NONE') continue;
      seenWeather.add(date);
      events.push({
        kind: 'WEATHER',
        date,
        violation,
        executionStress: violation === 'HARD' ? 85 : 55,
        at,
      });
      continue;
    }

    const roadIds = extractRoadIds(chunk);
    if (!roadIds.length) continue;

    const status = roadStatusFromChunk(chunk, category);
    const meta = (chunk.metadata ?? {}) as Record<string, unknown>;
    const affectedSlotIds = Array.isArray(meta.affected_slot_ids)
      ? (meta.affected_slot_ids as string[])
      : Array.isArray(meta.affectedSlotIds)
        ? (meta.affectedSlotIds as string[])
        : undefined;

    for (const roadId of roadIds) {
      const key = `${roadId}:${status}`;
      if (seenRoad.has(key)) continue;
      seenRoad.add(key);
      events.push({
        kind: 'ROAD',
        roadId,
        status,
        at,
        ...(affectedSlotIds?.length ? { affectedSlotIds } : {}),
      });
    }
  }

  return events;
}
