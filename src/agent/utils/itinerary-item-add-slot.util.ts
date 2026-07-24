/**
 * 绑定 Trip「新增 POI」时的活动时段推荐：白天游览、尊重营业时间、结合当日已有行程空档。
 */

import { DateTime } from 'luxon';
import { OpeningHoursUtil, OPENING_HOURS_UNKNOWN, isAlwaysOpenHoursText } from '../../common/utils/opening-hours.util';
import type { TripItemLikeForDelete } from './itinerary-item-delete.util';
import { detectPoiKinds } from './itinerary-item-add.util';

export interface ActivitySlotSuggestParams {
  tripDayDate: Date | string | null | undefined;
  items: TripItemLikeForDelete[];
  poiQuery: string;
  placeCategory?: string | null;
  openingHoursText?: string | null;
  timezone?: string;
  durationMinutes?: number;
}

export interface ActivitySlotSuggestion {
  startTime: string;
  endTime: string;
  localLabel: string;
  reasonZh: string;
}

const DEFAULT_TZ = 'Atlantic/Reykjavik';
const DEFAULT_SCENIC_OPEN = 9 * 60;
const DEFAULT_SCENIC_CLOSE = 17 * 60;
const DAYLIGHT_EARLIEST = 8 * 60;
const DAYLIGHT_LATEST = 20 * 60;

function parseHmToMinutes(hm: string): number | null {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** 解析 "Summer 8:00-18:00, Winter 9:00-17:00" 等季节性文案 */
export function resolveSeasonalHoursString(raw: string, tripDayDate: Date, timezone = DEFAULT_TZ): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (isAlwaysOpenHoursText(text)) return '24 Hours';

  const simple = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (simple && !/summer|winter|夏季|冬季/i.test(text)) {
    return `${simple[1]}-${simple[2]}`;
  }

  const dt = DateTime.fromJSDate(tripDayDate, { zone: timezone });
  const month = dt.month;
  const isSummer = month >= 4 && month <= 9;

  const summer = text.match(/(?:Summer|夏季)\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
  const winter = text.match(/(?:Winter|冬季)\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
  if (isSummer && summer) return `${summer[1]}-${summer[2]}`;
  if (!isSummer && winter) return `${winter[1]}-${winter[2]}`;
  if (summer) return `${summer[1]}-${summer[2]}`;
  if (winter) return `${winter[1]}-${winter[2]}`;
  if (simple) return `${simple[1]}-${simple[2]}`;
  return null;
}

export function openingHoursEvidenceToText(
  raw: unknown,
  tripDayDate: Date,
  timezone = DEFAULT_TZ,
): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    return resolveSeasonalHoursString(raw, tripDayDate, timezone) ?? raw;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.description === 'string') {
      const resolved = resolveSeasonalHoursString(o.description, tripDayDate, timezone);
      if (resolved) return resolved;
    }
    if (typeof o.osmFormat === 'string') return o.osmFormat;
    const today = OpeningHoursUtil.getTodayHours({ openingHours: raw }, timezone);
    if (today && today !== 'Closed' && today !== OPENING_HOURS_UNKNOWN) return today;
  }
  return undefined;
}

function parseOpeningWindowMinutes(
  hoursText: string | null | undefined,
  tripDayDate: Date,
  timezone: string,
): { openMin: number; closeMin: number; source: string } {
  const resolved =
    (hoursText && resolveSeasonalHoursString(hoursText, tripDayDate, timezone)) ||
    (hoursText && hoursText.includes('-') ? hoursText : null);

  if (resolved && resolved !== '24 Hours' && resolved !== '24/7') {
    const [a, b] = resolved.split('-');
    const openMin = parseHmToMinutes(a);
    let closeMin = parseHmToMinutes(b);
    if (openMin != null && closeMin != null) {
      if (closeMin <= openMin) closeMin += 24 * 60;
      return { openMin, closeMin: Math.min(closeMin, DAYLIGHT_LATEST + 60), source: resolved };
    }
  }

  return { openMin: DEFAULT_SCENIC_OPEN, closeMin: DEFAULT_SCENIC_CLOSE, source: '默认白天游览窗 09:00-17:00' };
}

function parseItemIntervalMs(
  item: TripItemLikeForDelete,
  dayStart: DateTime,
): { startMs: number; endMs: number } | null {
  const parseOne = (v: Date | string | null | undefined): number | null => {
    if (v == null) return null;
    const dt =
      v instanceof Date
        ? DateTime.fromJSDate(v, { zone: 'utc' })
        : DateTime.fromISO(String(v), { zone: 'utc' });
    return dt.isValid ? dt.toMillis() : null;
  };
  const startMs = parseOne(item.startTime);
  if (startMs == null) return null;
  const endMs = parseOne(item.endTime) ?? startMs + 60 * 60 * 1000;
  return { startMs, endMs };
}

function isScenicActivityPoi(poiQuery: string, category?: string | null): boolean {
  const cat = String(category ?? '').toLowerCase();
  if (/hotel|rest|campground|lodging|hostel|suites/i.test(cat)) return false;
  if (detectPoiKinds(poiQuery).has('hotel') || detectPoiKinds(poiQuery).has('campground')) return false;
  return true;
}

function defaultDurationMinutes(poiQuery: string): number {
  if (/国家公园|national\s*park/i.test(poiQuery)) return 150;
  if (/瀑布|foss|museum|博物馆/i.test(poiQuery)) return 90;
  return 120;
}

function formatLocalRange(start: DateTime, end: DateTime): string {
  return `${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')}`;
}

/** 在 TripDay 上为新增景点推荐白天活动时段（ISO UTC） */
export function suggestActivitySlotForDayAdd(
  params: ActivitySlotSuggestParams,
): ActivitySlotSuggestion {
  const timezone = params.timezone ?? DEFAULT_TZ;
  const duration = params.durationMinutes ?? defaultDurationMinutes(params.poiQuery);
  const scenic = isScenicActivityPoi(params.poiQuery, params.placeCategory);

  const dayStart = params.tripDayDate
    ? DateTime.fromJSDate(
        params.tripDayDate instanceof Date ? params.tripDayDate : new Date(String(params.tripDayDate)),
        { zone: 'utc' },
      ).startOf('day')
    : DateTime.now().setZone(timezone).startOf('day');

  const tripDayDateJs = dayStart.toJSDate();
  const { openMin, closeMin, source } = parseOpeningWindowMinutes(
    params.openingHoursText,
    tripDayDateJs,
    timezone,
  );

  let windowOpen = scenic ? Math.max(openMin, DAYLIGHT_EARLIEST) : openMin;
  let windowClose = scenic ? Math.min(closeMin, DAYLIGHT_LATEST) : closeMin;
  if (windowClose - windowOpen < duration) {
    windowOpen = DEFAULT_SCENIC_OPEN;
    windowClose = DEFAULT_SCENIC_CLOSE;
  }

  const busy = params.items
    .map((it) => parseItemIntervalMs(it, dayStart))
    .filter(Boolean) as Array<{ startMs: number; endMs: number }>;

  const preferredMid = 13 * 60;
  let best: { startMin: number; score: number } | null = null;

  for (let startMin = windowOpen; startMin + duration <= windowClose; startMin += 30) {
    const startDt = dayStart.setZone(timezone).plus({ minutes: startMin });
    const endDt = startDt.plus({ minutes: duration });
    const startMs = startDt.toUTC().toMillis();
    const endMs = endDt.toUTC().toMillis();

    const overlaps = busy.some((b) => startMs < b.endMs && endMs > b.startMs);
    if (overlaps) continue;

    const mid = startMin + duration / 2;
    let score = 1000 - Math.abs(mid - preferredMid);
    if (startMin >= 10 * 60 && startMin <= 15 * 60) score += 80;
    if (startMin >= windowOpen && startMin + duration <= Math.min(closeMin, 18 * 60)) score += 40;
    if (startMin >= 18 * 60) score -= 500;

    if (!best || score > best.score) {
      best = { startMin, score };
    }
  }

  if (!best) {
    const fallbackStart = Math.min(windowOpen + 60, Math.max(windowOpen, windowClose - duration));
    const startDt = dayStart.setZone(timezone).plus({ minutes: fallbackStart });
    const endDt = startDt.plus({ minutes: duration });
    return {
      startTime: startDt.toUTC().toISO()!,
      endTime: endDt.toUTC().toISO()!,
      localLabel: formatLocalRange(startDt, endDt),
      reasonZh: `当日白天空档较满，已尽量安排在 ${source} 内`,
    };
  }

  const startDt = dayStart.setZone(timezone).plus({ minutes: best.startMin });
  const endDt = startDt.plus({ minutes: duration });
  return {
    startTime: startDt.toUTC().toISO()!,
    endTime: endDt.toUTC().toISO()!,
    localLabel: formatLocalRange(startDt, endDt),
    reasonZh: scenic
      ? `结合当日行程空档与营业时间（${source}），推荐白天游览`
      : `结合当日行程空档推荐时段`,
  };
}

/** @deprecated 请使用 {@link suggestActivitySlotForDayAdd} */
export function suggestAddSlotIso(
  tripDayDate: Date | string | null | undefined,
  items: TripItemLikeForDelete[],
): { startTime: string; endTime: string } {
  const slot = suggestActivitySlotForDayAdd({
    tripDayDate,
    items,
    poiQuery: '景点',
  });
  return { startTime: slot.startTime, endTime: slot.endTime };
}
