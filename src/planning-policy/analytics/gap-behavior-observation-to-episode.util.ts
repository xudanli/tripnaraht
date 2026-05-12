import type { GapBehaviorObservation } from '../types/gap-behavior-observation.types';
import type { ItineraryGapType } from '../types/itinerary-gap.types';
import type { GapBehaviorEpisodeRecord } from './gap-behavior-drift.types';

const ITINERARY_GAPS: readonly ItineraryGapType[] = [
  'MISSING_RELAXED_EVENING',
  'MISSING_RAIN_FALLBACK',
  'OVER_DENSE_DAY',
  'LACK_LOCAL_FOOD',
  'INSUFFICIENT_REST',
];

const gapTypeSet = new Set<string>(ITINERARY_GAPS);

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

function asFiniteNonNegNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

/**
 * 将内核 `GapBehaviorObservation` 转为漂移分析用的 episode 行（只读；无副作用）。
 * 可选附带时段计数，供 P0 时间结构分析（上游有数据时再填）。
 */
export function gapBehaviorObservationToEpisodeRecord(
  obs: GapBehaviorObservation,
  extras?: Pick<GapBehaviorEpisodeRecord, 'eveningLikeSelectedCount' | 'morningLikeSelectedCount'>,
): GapBehaviorEpisodeRecord {
  return {
    ts: obs.ts,
    primaryGap: obs.primaryGap,
    allGapTypes: obs.allGapTypes,
    selectedCount: obs.selectedCount,
    indoorishSelectedCount: obs.indoorishSelectedCount,
    categoryHistogram: obs.categoryHistogram,
    ...extras,
  };
}

/**
 * 从网关 / 日志中的松散对象（camelCase 或 snake_case）解析 episode；非法则返回 `undefined`。
 * 不参与任何执行路径。
 */
export function gapBehaviorObservationLoosePayloadToEpisodeRecord(raw: unknown): GapBehaviorEpisodeRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const pgRaw = asNonEmptyString(o.primary_gap ?? o.primaryGap);
  if (!pgRaw || !gapTypeSet.has(pgRaw)) return undefined;
  const primaryGap = pgRaw as ItineraryGapType;

  const selectedCount = Math.floor(asFiniteNonNegNumber(o.selected_count ?? o.selectedCount) ?? 0);
  let indoorish = Math.floor(asFiniteNonNegNumber(o.indoorish_selected_count ?? o.indoorishSelectedCount) ?? 0);
  if (indoorish > selectedCount) indoorish = selectedCount;

  const categoryHistogram: Array<{ category: string; count: number }> = [];
  const histRaw = o.category_histogram ?? o.categoryHistogram;
  if (Array.isArray(histRaw)) {
    for (const row of histRaw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const cat = asNonEmptyString(r.category);
      const cnt = asFiniteNonNegNumber(r.count);
      if (cat == null || cnt == null) continue;
      const n = Math.floor(cnt);
      if (n <= 0) continue;
      categoryHistogram.push({ category: cat.toUpperCase(), count: n });
    }
  }

  const allGapRaw = o.all_gap_types ?? o.allGapTypes;
  let allGapTypes: ItineraryGapType[] | undefined;
  if (Array.isArray(allGapRaw)) {
    const xs = allGapRaw
      .filter((x): x is string => typeof x === 'string' && gapTypeSet.has(x))
      .map((x) => x as ItineraryGapType);
    if (xs.length > 0) allGapTypes = xs;
  }
  if (!allGapTypes?.length) allGapTypes = [primaryGap];

  const ts = asNonEmptyString(o.ts);

  const ev = asFiniteNonNegNumber(o.evening_like_selected_count ?? o.eveningLikeSelectedCount);
  const mo = asFiniteNonNegNumber(o.morning_like_selected_count ?? o.morningLikeSelectedCount);
  const hasSlot = ev != null || mo != null;

  return {
    ...(ts ? { ts } : {}),
    primaryGap,
    allGapTypes,
    selectedCount,
    indoorishSelectedCount: indoorish,
    categoryHistogram,
    ...(hasSlot
      ? {
          eveningLikeSelectedCount: ev != null ? Math.floor(ev) : 0,
          morningLikeSelectedCount: mo != null ? Math.floor(mo) : 0,
        }
      : {}),
  };
}
