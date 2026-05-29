/**
 * 绑定 Trip 上「第 N 天新增某 POI」类 NL 意图解析与落库参数构建。
 */

import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import {
  type TripDayLikeForDelete,
  type TripItemLikeForDelete,
  type TripLikeForDelete,
} from './itinerary-item-delete.util';

export interface ItineraryItemAddSpec {
  dayNumber?: number;
  poiQuery: string;
}

const ADD_VERB_RE = /(?:新增|添加|加上|加入|插入|加一个)/;

/** 用户是否在已有行程语境下请求新增某个 POI/活动 */
export function detectItineraryItemAddIntent(message: string): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim() || !ADD_VERB_RE.test(t)) return false;
  if (/(?:新增|添加|加入).*(?:账户|账号|订单|记录|好友)/.test(t)) return false;
  const hasDayAnchor = /第\s*\d+\s*天|D\s*\d+/i.test(t);
  const hasPoiAnchor =
    /(?:poi|景点|活动|瀑布|酒店|餐厅|公园|博物馆|教堂|沙滩|冰川|温泉|国家公园)/i.test(t) ||
    /[\u4e00-\u9fff]{2,}/.test(
      t.replace(ADD_VERB_RE, '').replace(/第\s*\d+\s*天/g, '').replace(/[，,、]/g, ''),
    );
  return hasDayAnchor || hasPoiAnchor;
}

/** 从 NL 抽取「第几天 + POI 名」 */
export function parseItineraryItemAddSpec(message: string): ItineraryItemAddSpec | null {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? '')).trim();
  if (!t || !ADD_VERB_RE.test(t)) return null;

  const dayMatch = t.match(/第\s*(\d+)\s*天/);
  const dayNumber = dayMatch ? Number(dayMatch[1]) : undefined;

  let poiPart = t
    .replace(/^.*?第\s*\d+\s*天(?:[，,、\s]*)?(?:新增|添加|加上|加入|插入)\s*/u, '')
    .replace(/^.*?(?:新增|添加|加上|加入|插入)\s*第\s*\d+\s*天(?:的|里|中)?\s*/u, '')
    .replace(/^.*?(?:新增|添加|加上|加入|插入)\s*/u, '')
    .replace(/\s*poi\s*$/iu, '')
    .trim();

  if (!poiPart) {
    const fallback = t.match(/(?:新增|添加|加上|加入|插入)\s*(.+)$/u);
    poiPart = (fallback?.[1] ?? '')
      .replace(/^第\s*\d+\s*天(?:的|里|中)?\s*/u, '')
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
    q
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/poi$/i, '')
      .replace(/[「」"'‘’]/g, ''),
  );
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

function placeDisplayNames(place: {
  nameCN?: string | null;
  nameEN?: string | null;
}): string[] {
  return [place.nameCN, place.nameEN]
    .filter(Boolean)
    .map((n) => normalizePoiQuery(String(n)));
}

export function detectPoiKinds(text: string): Set<string> {
  const kinds = new Set<string>();
  const raw = String(text ?? '');
  if (/国家公园|national\s*park|nationalpark/i.test(raw)) kinds.add('national_park');
  if (/露营地|营地|campground|campsite|camping/i.test(raw)) kinds.add('campground');
  if (/瀑布|waterfall|\bfoss\b/i.test(raw)) kinds.add('waterfall');
  if (/酒店|宾馆|hotel|hostel|inn|suites?/i.test(raw)) kinds.add('hotel');
  if (/冰川|glacier/i.test(raw)) kinds.add('glacier');
  if (/博物馆|museum/i.test(raw)) kinds.add('museum');
  return kinds;
}

/** 用户点名「国家公园」时不应匹配「露营地/酒店」等同前缀 POI */
export function poiKindsConflict(queryText: string, candidateText: string): boolean {
  const qKinds = detectPoiKinds(queryText);
  const cKinds = detectPoiKinds(candidateText);
  if (!qKinds.size || !cKinds.size) return false;
  for (const k of qKinds) {
    if (cKinds.has(k)) return false;
  }
  const exclusive = ['national_park', 'campground', 'waterfall', 'hotel', 'glacier', 'museum'];
  const qExclusive = [...qKinds].filter((k) => exclusive.includes(k));
  const cExclusive = [...cKinds].filter((k) => exclusive.includes(k));
  return qExclusive.length > 0 && cExclusive.length > 0;
}

function placeLabel(place: { nameCN?: string | null; nameEN?: string | null }): string {
  return [place.nameCN, place.nameEN].filter(Boolean).join(' ');
}

function poiQueryStrictlyMatchesPlace(
  poiQuery: string,
  place: { nameCN?: string | null; nameEN?: string | null },
): boolean {
  const q = normalizePoiQuery(poiQuery);
  if (!q) return false;
  const label = placeLabel(place);
  if (poiKindsConflict(poiQuery, label)) return false;

  const names = placeDisplayNames(place);
  if (names.some((n) => n === q || n.includes(q) || q.includes(n))) return true;

  // 严格模式不做「去掉国家公园后只剩前缀」的模糊匹配
  if (/national\s*park|nationalpark/i.test(q) || /国家公园/.test(poiQuery)) {
    return names.some(
      (n) =>
        n.includes('nationalpark') ||
        n.includes('国家公园') ||
        (n.includes('national') && n.includes('park')),
    );
  }
  return false;
}

function poiQueryMatchesPlace(
  poiQuery: string,
  place: { nameCN?: string | null; nameEN?: string | null },
): boolean {
  const q = normalizePoiQuery(poiQuery);
  if (!q) return false;
  const label = placeLabel(place);
  if (poiKindsConflict(poiQuery, label)) return false;

  const names = placeDisplayNames(place);
  if (names.some((n) => n.includes(q) || q.includes(n))) return true;

  const core = q.replace(/瀑布|景点|博物馆|教堂|酒店|餐厅|露营地|营地|poi$/gi, '').replace(/国家公园/g, '');
  if (core.length >= 4 && names.some((n) => n.includes(core) || core.includes(n))) return true;
  if (/斯卡夫塔|skaftafell/i.test(q) && /国家公园|national\s*park/i.test(poiQuery)) {
    return names.some((n) => /national\s*park|nationalpark|国家公园/.test(n) && n.includes('skaftafell'));
  }
  if (/斯卡夫塔|skaftafell/i.test(q) && names.some((n) => n.includes('skaftafell'))) return true;
  if (/斯科加|skoga/i.test(q) && names.some((n) => n.includes('skoga'))) return true;
  return false;
}

function poiQueryMatchesItem(poiQuery: string, item: TripItemLikeForDelete, strict = false): boolean {
  const place = item.Place ?? item.place;
  const matcher = strict ? poiQueryStrictlyMatchesPlace : poiQueryMatchesPlace;
  if (place) return matcher(poiQuery, place);
  if (item.note && matcher(poiQuery, { nameCN: item.note })) return true;
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

export function resolveTripDayIdForAdd(
  trip: TripLikeForDelete,
  dayNumber: number | undefined,
): { tripDayId?: string; dayNumber?: number } {
  const days = tripDays(trip);
  if (!days.length) return {};
  const idx =
    dayNumber != null && dayNumber > 0
      ? dayNumber - 1
      : days.length - 1;
  if (idx < 0 || idx >= days.length) return {};
  const day = days[idx];
  const tripDayId = day.id?.trim();
  if (!tripDayId) return {};
  return { tripDayId, dayNumber: idx + 1 };
}

/** 从 Trip 全行程 Place + 外部候选中解析 placeId */
export function resolvePlaceIdForAdd(
  trip: TripLikeForDelete,
  spec: ItineraryItemAddSpec,
  externalCandidates?: Array<{ id?: number; nameCN?: string | null; nameEN?: string | null }>,
): number | undefined {
  const seen = new Set<number>();
  const scored: Array<{ id: number; score: number }> = [];
  const tryPlace = (p: { id?: number; nameCN?: string | null; nameEN?: string | null }) => {
    if (p.id == null || seen.has(p.id)) return;
    if (!poiQueryMatchesPlace(spec.poiQuery, p)) return;
    seen.add(p.id);
    const label = placeLabel(p);
    let score = 1;
    const qn = normalizePoiQuery(spec.poiQuery);
    const nn = normalizePoiQuery(label);
    if (nn === qn || nn.includes(qn) || qn.includes(nn)) score += 3;
    if (/国家公园|national\s*park/i.test(spec.poiQuery) && /国家公园|national\s*park/i.test(label)) {
      score += 4;
    }
    if (poiKindsConflict(spec.poiQuery, label)) return;
    scored.push({ id: p.id, score });
  };

  for (const day of tripDays(trip)) {
    for (const item of dayItems(day)) {
      const place = item.Place ?? item.place;
      if (place?.id != null) tryPlace(place);
    }
  }

  for (const p of externalCandidates ?? []) {
    tryPlace(p);
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id;
}

export function itemAlreadyOnDay(
  trip: TripLikeForDelete,
  dayNumber: number | undefined,
  poiQuery: string,
): boolean {
  const days = tripDays(trip);
  if (!days.length || dayNumber == null || dayNumber <= 0) return false;
  const idx = dayNumber - 1;
  if (idx < 0 || idx >= days.length) return false;
  return dayItems(days[idx]).some((item) => poiQueryMatchesItem(poiQuery, item, true));
}

export { suggestActivitySlotForDayAdd, suggestAddSlotIso } from './itinerary-item-add-slot.util';

export function buildItineraryItemAddAnswerText(
  spec: ItineraryItemAddSpec,
  addedCount: number,
  opts?: {
    dayNumber?: number;
    placeName?: string;
    alreadyExists?: boolean;
    scheduledTimeLabel?: string;
    scheduleReasonZh?: string;
  },
): string {
  const requestedDay = spec.dayNumber ? `第${spec.dayNumber}天` : '行程中';
  const matchedDay = opts?.dayNumber ?? spec.dayNumber;
  const dayPart = matchedDay ? `第${matchedDay}天` : '行程中';
  const namePart = opts?.placeName ? `「${opts.placeName}」` : `「${spec.poiQuery}」`;

  if (opts?.alreadyExists) {
    return `${dayPart}已有${namePart}，无需重复添加。`;
  }
  if (addedCount <= 0) {
    return `未找到与${namePart}匹配的地点，请检查名称或尝试更完整的 POI 名称。`;
  }
  const timePart = opts?.scheduledTimeLabel ? `，安排时段 ${opts.scheduledTimeLabel}` : '';
  const reasonPart = opts?.scheduleReasonZh ? `（${opts.scheduleReasonZh}）` : '';
  return `已在${dayPart}新增 ${addedCount} 个与${namePart}相关的行程项${timePart}${reasonPart}。`;
}
