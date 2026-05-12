import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { PoiSearchContext } from '../types/poi-search-context.types';
import type { ItineraryGap, ItineraryGapType } from '../types/itinerary-gap.types';
import type { RetrievalCauseEvent } from '../types/retrieval-cause-event.types';

function normalizeFatigue(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  if (raw >= 0 && raw <= 1) return raw;
  if (raw > 1 && raw <= 100) return Math.min(1, raw / 100);
  return undefined;
}

function countDaysAndItems(itinerary: unknown): { dayCount: number; poiCount: number; mealCount: number; avgItemsPerDay: number } {
  if (!itinerary || typeof itinerary !== 'object') {
    return { dayCount: 0, poiCount: 0, mealCount: 0, avgItemsPerDay: 0 };
  }
  const days = (itinerary as { days?: unknown[] }).days;
  if (!Array.isArray(days) || days.length === 0) {
    return { dayCount: 0, poiCount: 0, mealCount: 0, avgItemsPerDay: 0 };
  }
  let poiCount = 0;
  let mealCount = 0;
  let totalItems = 0;
  for (const d of days) {
    const items = (d as { items?: unknown[] })?.items;
    if (!Array.isArray(items)) continue;
    totalItems += items.length;
    for (const it of items) {
      const row = it as { type?: string };
      const t = String(row?.type ?? '').toUpperCase();
      if (t === 'POI' || (it as any)?.location_ref?.place_id) poiCount += 1;
      if (t === 'MEAL' || t === 'DINING' || t === 'LUNCH' || t === 'DINNER' || t === 'BREAKFAST') mealCount += 1;
    }
  }
  const dayCount = days.length;
  return {
    dayCount,
    poiCount,
    mealCount,
    avgItemsPerDay: dayCount > 0 ? totalItems / dayCount : 0,
  };
}

/** 极简室内/可雨天兜底启发（非本体论） */
function itineraryHasIndoorLikePoi(itinerary: unknown): boolean {
  if (!itinerary || typeof itinerary !== 'object') return false;
  const days = (itinerary as { days?: unknown[] }).days;
  if (!Array.isArray(days)) return false;
  for (const d of days) {
    const items = (d as { items?: unknown[] })?.items;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const row = it as {
        type?: string;
        name?: string;
        category?: string;
        metadata?: { category?: string };
        location_ref?: { name?: string };
      };
      const t = String(row?.type ?? '').toUpperCase();
      if (t !== 'POI' && !(row as any)?.location_ref?.place_id) continue;
      const name = `${row?.location_ref?.name ?? ''} ${row?.name ?? ''}`.toLowerCase();
      const cat = String(row?.metadata?.category ?? row?.category ?? '').toUpperCase();
      if (['MUSEUM', 'GALLERY', 'AQUARIUM'].includes(cat)) return true;
      if (
        /museum|博物馆|咖啡|cafe|gallery|美术馆|商场|mall|aquarium|indoor|温泉|spa|onsen|浴|图书馆|library/.test(
          name,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function isAdverseWeather(ctx: PoiSearchContext, env?: DecisionState['environmentState']): boolean {
  const c = ctx.weather?.condition?.toLowerCase() ?? '';
  if (c.includes('elevated_precip') || c.includes('windy')) return true;
  const risk = env && typeof env.weatherRisk === 'number' && Number.isFinite(env.weatherRisk) ? env.weatherRisk : undefined;
  if (risk != null && risk > 0.55) return true;
  return false;
}

function closedItemSuggestsRelaxThermal(categoryHint: string | undefined): boolean {
  if (!categoryHint?.trim()) return false;
  const u = categoryHint.toUpperCase();
  if (/SPA|SPRING|THERMAL|ONSEN|WELLNESS|BATH|HOT/.test(u)) return true;
  return false;
}

const GAP_REASON: Record<ItineraryGapType, string> = {
  MISSING_RAIN_FALLBACK: 'fill_missing_rain_indoor_experience',
  INSUFFICIENT_REST: 'insert_rest_recovery_slots',
  OVER_DENSE_DAY: 'reduce_day_density_pacing_recovery',
  MISSING_RELAXED_EVENING: 'fill_missing_relaxed_evening_experience',
  LACK_LOCAL_FOOD: 'fill_missing_local_food_experience',
};

/** 多缺口时固定优先级（v1）；同优先级保留先插入者 */
const GAP_PRIORITY: ItineraryGapType[] = [
  'MISSING_RAIN_FALLBACK',
  'INSUFFICIENT_REST',
  'OVER_DENSE_DAY',
  'MISSING_RELAXED_EVENING',
  'LACK_LOCAL_FOOD',
];

/**
 * 规则型语义缺口检测（v1）。不调用 LLM；启发式可随产品迭代替换。
 */
export function detectItineraryGapsV1(input: {
  poiSearchCtx: PoiSearchContext;
  decisionState?: DecisionState;
  itinerary?: unknown;
  /** replacement 等路径可传入 */
  causedByEvent?: RetrievalCauseEvent;
  /** 闭馆项 category hint（repair 传入） */
  closedItemCategoryHint?: string;
}): ItineraryGap[] {
  const gaps: ItineraryGap[] = [];
  const { poiSearchCtx, decisionState, itinerary, causedByEvent, closedItemCategoryHint } = input;
  const env = decisionState?.environmentState;
  const tripState = decisionState?.tripState;
  const fatigue = poiSearchCtx.fatigueScore ?? normalizeFatigue(tripState?.fatigue);
  const pacing = poiSearchCtx.pacing;
  const stats = countDaysAndItems(itinerary);

  if (typeof fatigue === 'number' && fatigue > 0.8) {
    gaps.push({ type: 'OVER_DENSE_DAY', severity: fatigue });
  } else if (typeof fatigue === 'number' && fatigue > 0.55 && pacing === 'intensive') {
    gaps.push({ type: 'INSUFFICIENT_REST', severity: fatigue });
  }

  if (isAdverseWeather(poiSearchCtx, env) && !itineraryHasIndoorLikePoi(itinerary)) {
    gaps.push({ type: 'MISSING_RAIN_FALLBACK', severity: 0.75 });
  }

  if (stats.dayCount > 0 && stats.mealCount < Math.max(1, Math.floor(stats.dayCount * 0.35))) {
    gaps.push({ type: 'LACK_LOCAL_FOOD', severity: 0.5 });
  }

  const relaxedEveningFromClosed =
    causedByEvent?.type === 'POI_CLOSED' &&
    (closedItemSuggestsRelaxThermal(closedItemCategoryHint) || pacing === 'relaxed');
  const relaxedEveningFromState =
    pacing === 'relaxed' && typeof fatigue === 'number' && fatigue > 0.45 && fatigue <= 0.8;
  if (relaxedEveningFromClosed) {
    gaps.push({
      type: 'MISSING_RELAXED_EVENING',
      severity: 0.65,
      causedByEvent,
    });
  } else if (relaxedEveningFromState) {
    gaps.push({ type: 'MISSING_RELAXED_EVENING', severity: 0.55 });
  }

  const seen = new Set<ItineraryGapType>();
  const dedup: ItineraryGap[] = [];
  for (const g of gaps) {
    if (seen.has(g.type)) continue;
    seen.add(g.type);
    dedup.push(g);
  }
  return dedup;
}

/** 与 `retrievalReasonFromSemanticGaps` / `gapRetrievalIntentQuerySuffix` 同源优先级的主缺口 */
export function getPrimarySemanticGap(gaps: ItineraryGap[]): ItineraryGap | undefined {
  if (!gaps.length) return undefined;
  const rank = (t: ItineraryGapType) => {
    const i = GAP_PRIORITY.indexOf(t);
    return i < 0 ? 999 : i;
  };
  return [...gaps].sort((a, b) => rank(a.type) - rank(b.type))[0];
}

/** 将缺口列表收敛为一条检索意图（retrievalReason）；无缺口则 undefined */
export function retrievalReasonFromSemanticGaps(gaps: ItineraryGap[]): string | undefined {
  const primary = getPrimarySemanticGap(gaps);
  return primary ? GAP_REASON[primary.type] : undefined;
}

/** 主缺口 → 符号化 query 后缀（v1，与 `retrievalReasonFromSemanticGaps` 同源优先级） */
export function gapRetrievalIntentQuerySuffix(gaps: ItineraryGap[]): string {
  const p = getPrimarySemanticGap(gaps);
  if (!p) return '';
  const frag: Record<ItineraryGapType, string> = {
    MISSING_RAIN_FALLBACK: 'indoor cafe museum gallery sheltered drive rainy day',
    MISSING_RELAXED_EVENING: 'evening relaxing neighborhood spa onsen walk low key',
    OVER_DENSE_DAY: 'easy rest light activity recovery pacing',
    LACK_LOCAL_FOOD: 'local food restaurant market street food authentic dining',
    INSUFFICIENT_REST: 'rest cafe downtime buffer recovery',
  };
  const s = frag[p.type];
  return s ? ` ${s}` : '';
}
