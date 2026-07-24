/**
 * 绑定 Trip 上「删除第 N 天某 POI」类 NL 意图解析与行程项匹配。
 */

import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import { parseTripDayNumber } from './itinerary-item-add.util';

export interface ItineraryItemDeleteSpec {
  dayNumber?: number;
  poiQuery: string;
}

export type TripDayLikeForDelete = {
  id?: string;
  date?: Date | string | null;
  ItineraryItem?: TripItemLikeForDelete[];
  items?: TripItemLikeForDelete[];
};

export type TripItemLikeForDelete = {
  id: string;
  placeId?: number | null;
  note?: string | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  Place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
  place?: { id?: number; nameCN?: string | null; nameEN?: string | null } | null;
};

export type TripLikeForDelete = {
  TripDay?: TripDayLikeForDelete[];
  days?: TripDayLikeForDelete[];
};

const DELETE_VERB_RE = /(?:删除|移除|取消|去掉|删掉|删去|删了)/;

/** 用户是否在已有行程语境下请求删除某个 POI/活动 */
export function detectItineraryItemDeleteIntent(message: string): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim() || !DELETE_VERB_RE.test(t)) return false;
  if (/(?:删除|移除).*(?:烦恼|压力|焦虑|账户|账号|订单|记录)/.test(t)) return false;
  const hasDayAnchor = parseTripDayNumber(t) != null || /\bD\s*\d+\b/i.test(t);
  const hasPoiAnchor =
    /(?:poi|景点|活动|瀑布|酒店|餐厅|公园|博物馆|教堂|沙滩|冰川|温泉)/i.test(t) ||
    /[\u4e00-\u9fff]{2,}/.test(
      t.replace(DELETE_VERB_RE, '').replace(/第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天/g, ''),
    );
  return hasDayAnchor || hasPoiAnchor;
}

/** 从 NL 抽取「第几天 + POI 名」 */
export function parseItineraryItemDeleteSpec(message: string): ItineraryItemDeleteSpec | null {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? '')).trim();
  if (!t || !DELETE_VERB_RE.test(t)) return null;

  const dayNumber = parseTripDayNumber(t);

  const suffixMatch = t.match(
    /第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天(?:的|里|中)?\s*(.+?)\s*(?:删了|删掉|删去|删除|移除)$/u,
  );
  if (suffixMatch?.[1]) {
    const poiQuery = suffixMatch[1].replace(/\s*poi\s*$/iu, '').trim();
    if (poiQuery.length >= 2) {
      return { dayNumber, poiQuery };
    }
  }

  let poiPart = t
    .replace(/^.*?(?:删除|移除|取消|去掉|删掉|删去|删了)\s*/u, '')
    .replace(/^第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天(?:的|里|中)?\s*/u, '')
    .replace(/\s*poi\s*$/iu, '')
    .trim();

  if (!poiPart) {
    const fallback = t.match(/(?:删除|移除|取消|去掉|删掉|删去|删了)\s*(.+)$/u);
    poiPart = (fallback?.[1] ?? '')
      .replace(/^第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天(?:的|里|中)?\s*/u, '')
      .replace(/\s*poi\s*$/iu, '')
      .trim();
  }

  if (!poiPart || poiPart.length < 2) return null;
  return {
    dayNumber: dayNumber && dayNumber > 0 ? dayNumber : undefined,
    poiQuery: poiPart,
  };
}

function normalizePoiQuery(q: string): string {
  return stripDiacritics(
    q.trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/poi$/i, '')
      .replace(/[「」"'‘’]/g, ''),
  );
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

function itemDisplayNames(item: TripItemLikeForDelete): string[] {
  const place = item.Place ?? item.place;
  const names = [place?.nameCN, place?.nameEN, item.note].filter(Boolean) as string[];
  return names.map((n) => normalizePoiQuery(String(n)));
}

function poiQueryMatchesItem(poiQuery: string, item: TripItemLikeForDelete): boolean {
  const q = normalizePoiQuery(poiQuery);
  if (!q) return false;
  const names = itemDisplayNames(item);
  if (names.some((n) => n.includes(q) || q.includes(n))) return true;
  const core = q.replace(/瀑布|景点|公园|博物馆|教堂|酒店|餐厅/g, '');
  if (core.length >= 2 && names.some((n) => n.includes(core) || core.includes(n))) return true;
  // 斯科加瀑布 ↔ skogafoss / skoga
  if (/斯科加|skoga/i.test(q) && names.some((n) => n.includes('skoga'))) return true;
  return false;
}

function tripDays(trip: TripLikeForDelete): TripDayLikeForDelete[] {
  if (Array.isArray(trip.days) && trip.days.length) return trip.days;
  return trip.TripDay ?? [];
}

function dayItems(day: TripDayLikeForDelete): TripItemLikeForDelete[] {
  if (Array.isArray(day.items) && day.items.length) return day.items;
  return day.ItineraryItem ?? [];
}

/** 按 POI 名在 Trip 行程项上解析 placeId（改排草案 apply 落库兜底） */
export function resolvePlaceIdFromTripItems(
  trip: TripLikeForDelete,
  poiName: string,
  targetDateIso?: string,
): number | undefined {
  const q = String(poiName ?? '').trim();
  if (!q) return undefined;
  const target = targetDateIso?.slice(0, 10);
  for (const day of tripDays(trip)) {
    if (target) {
      const raw = day.date;
      const dayIso =
        raw instanceof Date
          ? raw.toISOString().slice(0, 10)
          : String(raw ?? '').slice(0, 10);
      if (dayIso !== target) continue;
    }
    for (const item of dayItems(day)) {
      if (!poiQueryMatchesItem(q, item)) continue;
      const pid = item.placeId ?? item.Place?.id ?? item.place?.id;
      if (typeof pid === 'number' && pid > 0) return pid;
    }
  }
  return undefined;
}

/** 按 dayNumber + POI 名在 Trip 上解析待删 itemId 列表 */
export function resolveItemIdsForDeleteFromTrip(
  trip: TripLikeForDelete,
  spec: ItineraryItemDeleteSpec,
): string[] {
  const days = tripDays(trip);
  if (!days.length) return [];

  const targetDayIndexes =
    spec.dayNumber != null
      ? [spec.dayNumber - 1].filter((i) => i >= 0 && i < days.length)
      : days.map((_, i) => i);

  const ids: string[] = [];
  for (const dayIdx of targetDayIndexes) {
    for (const item of dayItems(days[dayIdx])) {
      if (!item?.id) continue;
      if (poiQueryMatchesItem(spec.poiQuery, item)) {
        ids.push(String(item.id));
      }
    }
  }
  return [...new Set(ids)];
}

export interface ItineraryItemDeleteResolveResult {
  itemIds: string[];
  matchedDayNumber?: number;
  usedDayFallback: boolean;
}

/** 指定天数无匹配时，回退到全行程按 POI 名搜索（避免误进 GATE_EVAL 全链路） */
export function resolveItemIdsForDeleteWithFallback(
  trip: TripLikeForDelete,
  spec: ItineraryItemDeleteSpec,
): ItineraryItemDeleteResolveResult {
  const primary = resolveItemIdsForDeleteFromTrip(trip, spec);
  if (primary.length || spec.dayNumber == null) {
    return { itemIds: primary, matchedDayNumber: spec.dayNumber, usedDayFallback: false };
  }

  const days = tripDays(trip);
  for (let i = 0; i < days.length; i++) {
    const ids = resolveItemIdsForDeleteFromTrip(trip, {
      poiQuery: spec.poiQuery,
      dayNumber: i + 1,
    });
    if (ids.length) {
      return { itemIds: ids, matchedDayNumber: i + 1, usedDayFallback: true };
    }
  }
  return { itemIds: [], usedDayFallback: false };
}

export function buildItineraryItemDeleteAnswerText(
  spec: ItineraryItemDeleteSpec,
  deletedCount: number,
  opts?: { matchedDayNumber?: number; usedDayFallback?: boolean },
): string {
  const requestedDay = spec.dayNumber ? `第${spec.dayNumber}天` : '行程中';
  if (deletedCount <= 0) {
    return `未在${requestedDay}找到与「${spec.poiQuery}」匹配的行程项，请检查名称或天数。`;
  }
  const matchedDay = opts?.matchedDayNumber ?? spec.dayNumber;
  const dayPart = matchedDay ? `第${matchedDay}天` : '行程中';
  if (opts?.usedDayFallback && spec.dayNumber && matchedDay && matchedDay !== spec.dayNumber) {
    return `未在${requestedDay}找到「${spec.poiQuery}」，已从${dayPart}删除 ${deletedCount} 个相关行程项。`;
  }
  return `已从${dayPart}删除 ${deletedCount} 个与「${spec.poiQuery}」相关的行程项。`;
}
