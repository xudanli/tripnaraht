/**
 * 绑定 Trip 上「修改某 POI 行程时间」类 NL 意图解析与落库参数构建。
 */

import { DateTime } from 'luxon';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import { detectItineraryItemAddIntent } from './itinerary-item-add.util';
import { detectItineraryItemDeleteIntent } from './itinerary-item-delete.util';
import {
  type TripDayLikeForDelete,
  type TripItemLikeForDelete,
  type TripLikeForDelete,
  resolveItemIdsForDeleteWithFallback,
} from './itinerary-item-delete.util';

export interface ItineraryItemUpdateSpec {
  dayNumber?: number;
  poiQuery: string;
  startHour: number;
  startMinute: number;
  endHour?: number;
  endMinute?: number;
  /** 用户只指定开始时间，结束时间沿用原行程项时长 */
  startOnly?: boolean;
}

export interface ParsedTimeRange {
  startHour: number;
  startMinute: number;
  endHour?: number;
  endMinute?: number;
  matchedText: string;
  localLabel: string;
  startOnly?: boolean;
}

const UPDATE_VERB_RE = /(?:将|把|给|修改|调整|改|换成|改为|改到|移至|移到)/;
const TIME_ANCHOR_RE =
  /(?:时间点|时间|时段|开始时间|结束时间)|\d{1,2}\s*[:：]\d{2}|\d{1,2}\s*点(?:\d{1,2})?/;

/** 用户是否在已有行程语境下请求修改某个 POI 的时间 */
export function detectItineraryItemUpdateIntent(message: string): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim() || !UPDATE_VERB_RE.test(t)) return false;
  if (detectItineraryItemDeleteIntent(t) || detectItineraryItemAddIntent(t)) return false;
  if (/(?:修改|调整).*(?:账户|账号|订单|记录|密码|资料)/.test(t)) return false;

  const hasTimeAnchor = TIME_ANCHOR_RE.test(t);
  const stripped = t
    .replace(UPDATE_VERB_RE, '')
    .replace(/第\s*\d+\s*天/g, '')
    .replace(/(?:时间点|时间|时段|行程|安排|为|到|至|开始|结束|\d{1,2}[:：点分\-—])/g, '');
  const hasPoiAnchor =
    /(?:poi|景点|活动|瀑布|酒店|餐厅|公园|博物馆|教堂|沙滩|冰川|温泉|冰河湖)/i.test(t) ||
    /[\u4e00-\u9fff]{2,}/.test(stripped);
  return hasTimeAnchor && hasPoiAnchor;
}

function padHm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 从 NL 中解析起止时间 */
export function parseTimeRangeFromUpdateMessage(message: string): ParsedTimeRange | null {
  const t = String(message ?? '');
  const patterns: Array<{
    re: RegExp;
    map: (m: RegExpMatchArray) => ParsedTimeRange | null;
  }> = [
    {
      re: /(\d{1,2})[:：](\d{2})\s*(?:到|至|-|—)\s*(\d{1,2})[:：](\d{2})/,
      map: (m) => {
        const sh = Number(m[1]);
        const sm = Number(m[2]);
        const eh = Number(m[3]);
        const em = Number(m[4]);
        if (!isValidHm(sh, sm) || !isValidHm(eh, em)) return null;
        return {
          startHour: sh,
          startMinute: sm,
          endHour: eh,
          endMinute: em,
          matchedText: m[0],
          localLabel: `${padHm(sh, sm)}–${padHm(eh, em)}`,
        };
      },
    },
    {
      re: /(\d{1,2})\s*点(?:\s*(\d{1,2}))?(?:\s*分)?\s*(?:开始)?\s*(?:到|至|-|—)\s*(\d{1,2})\s*点(?:\s*(\d{1,2}))?(?:\s*分)?(?:\s*结束)?/,
      map: (m) => {
        const sh = Number(m[1]);
        const sm = m[2] ? Number(m[2]) : 0;
        const eh = Number(m[3]);
        const em = m[4] ? Number(m[4]) : 0;
        if (!isValidHm(sh, sm) || !isValidHm(eh, em)) return null;
        return {
          startHour: sh,
          startMinute: sm,
          endHour: eh,
          endMinute: em,
          matchedText: m[0],
          localLabel: `${padHm(sh, sm)}–${padHm(eh, em)}`,
        };
      },
    },
    {
      re: /(?:改为|改成|改到|调整为|调整到|换为|换成|为)\s*(\d{1,2})\s*点(\d{1,2})(?!\s*分)(?!\s*(?:到|至|-|—))/,
      map: (m) => {
        const sh = Number(m[1]);
        const sm = Number(m[2]);
        if (!isValidHm(sh, sm)) return null;
        return {
          startHour: sh,
          startMinute: sm,
          matchedText: m[0],
          localLabel: `${padHm(sh, sm)}起`,
          startOnly: true,
        };
      },
    },
    {
      re: /(?:改为|改成|改到|调整为|调整到|换为|换成|为)\s*(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分)?(?!\s*(?:到|至|-|—))/,
      map: (m) => {
        const sh = Number(m[1]);
        const sm = m[2] ? Number(m[2]) : 0;
        if (!isValidHm(sh, sm)) return null;
        return {
          startHour: sh,
          startMinute: sm,
          matchedText: m[0],
          localLabel: `${padHm(sh, sm)}起`,
          startOnly: true,
        };
      },
    },
    {
      re: /(?:改为|改成|改到|调整为|调整到|换为|换成|为)\s*(\d{1,2})[:：](\d{2})(?!\s*(?:到|至|-|—))/,
      map: (m) => {
        const sh = Number(m[1]);
        const sm = Number(m[2]);
        if (!isValidHm(sh, sm)) return null;
        return {
          startHour: sh,
          startMinute: sm,
          matchedText: m[0],
          localLabel: `${padHm(sh, sm)}起`,
          startOnly: true,
        };
      },
    },
    {
      re: /(?:为|到|至|改成|改到)\s*(\d{1,2})\s*点(?:\s*(\d{1,2}))?\s*(?:到|至|-|—)\s*(\d{1,2})\s*点(?:\s*(\d{1,2}))?/,
      map: (m) => {
        const sh = Number(m[1]);
        const sm = m[2] ? Number(m[2]) : 0;
        const eh = Number(m[3]);
        const em = m[4] ? Number(m[4]) : 0;
        if (!isValidHm(sh, sm) || !isValidHm(eh, em)) return null;
        return {
          startHour: sh,
          startMinute: sm,
          endHour: eh,
          endMinute: em,
          matchedText: m[0],
          localLabel: `${padHm(sh, sm)}–${padHm(eh, em)}`,
        };
      },
    },
  ];

  for (const { re, map } of patterns) {
    const m = t.match(re);
    if (m) {
      const parsed = map(m);
      if (parsed && timeRangeIsValid(parsed)) return parsed;
    }
  }
  return null;
}

function isValidHm(h: number, m: number): boolean {
  return Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function timeRangeIsValid(range: ParsedTimeRange): boolean {
  if (range.startOnly || range.endHour == null || range.endMinute == null) return true;
  const start = range.startHour * 60 + range.startMinute;
  const end = range.endHour * 60 + range.endMinute;
  return end > start;
}

/** 从 NL 抽取「第几天 + POI 名 + 起止时间」 */
export function parseItineraryItemUpdateSpec(message: string): ItineraryItemUpdateSpec | null {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? '')).trim();
  if (!t || !detectItineraryItemUpdateIntent(t)) return null;

  const timeParsed = parseTimeRangeFromUpdateMessage(t);
  if (!timeParsed) return null;

  const dayMatch = t.match(/第\s*(\d+)\s*天/);
  const dayNumber = dayMatch ? Number(dayMatch[1]) : undefined;

  let poiPart = '';
  const named = t.match(
    /(?:将|把|给|修改|调整|改|换成|改为|改到)\s*(?:第\s*\d+\s*天(?:的|里|中)?\s*)?(.+?)(?:的)?(?:行程)?(?:开始时间|结束时间|时间点|时间|时段)/u,
  );
  if (named?.[1]) {
    poiPart = named[1].trim();
  } else {
    poiPart = t
      .replace(/^.*?(?:将|把|给|修改|调整|改|换成|改为|改到|移至|移到)\s*/u, '')
      .replace(/^第\s*\d+\s*天(?:的|里|中)?\s*/u, '')
      .replace(timeParsed.matchedText, '')
      .replace(/的?(?:行程)?(?:时间点|时间|时段|安排)/gu, '')
      .replace(/^(?:为|到|至|改成|改到)\s*/u, '')
      .replace(/(?:为|到)\s*$/u, '')
      .replace(/\s*poi\s*$/iu, '')
      .trim();
  }

  if (!poiPart || poiPart.length < 2) return null;

  return {
    dayNumber: dayNumber && dayNumber > 0 ? dayNumber : undefined,
    poiQuery: poiPart,
    startHour: timeParsed.startHour,
    startMinute: timeParsed.startMinute,
    endHour: timeParsed.endHour,
    endMinute: timeParsed.endMinute,
    startOnly: timeParsed.startOnly,
  };
}

function tripDays(trip: TripLikeForDelete): TripDayLikeForDelete[] {
  if (Array.isArray(trip.days) && trip.days.length) return trip.days;
  return trip.TripDay ?? [];
}

export interface ItineraryItemUpdateResolveResult {
  itemId?: string;
  matchedDayNumber?: number;
  usedDayFallback: boolean;
  placeName?: string;
  tripDayDate?: Date | string | null;
  matchedItem?: TripItemLikeForDelete;
}

/** 按 dayNumber + POI 名解析待改时间的 itemId */
export function resolveItemForUpdateWithFallback(
  trip: TripLikeForDelete,
  spec: ItineraryItemUpdateSpec,
): ItineraryItemUpdateResolveResult {
  const resolved = resolveItemIdsForDeleteWithFallback(trip, {
    dayNumber: spec.dayNumber,
    poiQuery: spec.poiQuery,
  });
  const itemId = resolved.itemIds[0];
  if (!itemId) {
    return { usedDayFallback: resolved.usedDayFallback };
  }

  const dayNumber = resolved.matchedDayNumber ?? spec.dayNumber;
  const days = tripDays(trip);
  const dayRow = dayNumber != null ? days[dayNumber - 1] : undefined;
  let placeName: string | undefined;
  let matchedItem: TripItemLikeForDelete | undefined;
  if (dayRow) {
    const items = dayRow.ItineraryItem ?? dayRow.items ?? [];
    const item = items.find((it) => String(it.id) === itemId);
    matchedItem = item;
    const place = item?.Place ?? item?.place;
    placeName = place?.nameCN ?? place?.nameEN ?? undefined;
  }

  return {
    itemId,
    matchedDayNumber: dayNumber,
    usedDayFallback: resolved.usedDayFallback,
    placeName,
    tripDayDate: dayRow?.date ?? null,
    matchedItem,
  };
}

function inferDurationMinutesFromItem(
  item: TripItemLikeForDelete | null | undefined,
  defaultDurationMinutes = 60,
): number {
  const parseOne = (v: Date | string | null | undefined): number | null => {
    if (v == null) return null;
    const dt =
      v instanceof Date
        ? DateTime.fromJSDate(v, { zone: 'utc' })
        : DateTime.fromISO(String(v), { zone: 'utc' });
    return dt.isValid ? dt.toMillis() : null;
  };
  const startMs = parseOne(item?.startTime);
  const endMs = parseOne(item?.endTime);
  if (startMs == null || endMs == null || endMs <= startMs) return defaultDurationMinutes;
  const minutes = Math.round((endMs - startMs) / 60000);
  if (minutes <= 0 || minutes > 8 * 60) return defaultDurationMinutes;
  return minutes;
}

/** 仅改开始时间时，沿用原行程项时长推算结束时间 */
export function applyExistingItemDurationToUpdateSpec(
  spec: ItineraryItemUpdateSpec,
  item: TripItemLikeForDelete | null | undefined,
  defaultDurationMinutes = 60,
): ItineraryItemUpdateSpec & { endHour: number; endMinute: number } {
  if (!spec.startOnly && spec.endHour != null && spec.endMinute != null) {
    return {
      ...spec,
      endHour: spec.endHour,
      endMinute: spec.endMinute,
    };
  }
  const duration = inferDurationMinutesFromItem(item, defaultDurationMinutes);
  const startMin = spec.startHour * 60 + spec.startMinute;
  const endMin = startMin + duration;
  return {
    ...spec,
    endHour: Math.floor(endMin / 60) % 24,
    endMinute: endMin % 60,
    startOnly: false,
  };
}

export function buildIsoTimesForUpdate(
  tripDayDate: Date | string | null | undefined,
  spec: ItineraryItemUpdateSpec & { endHour: number; endMinute: number },
  timezone = 'Atlantic/Reykjavik',
): { startTime: string; endTime: string; localLabel: string } {
  const dayStart = tripDayDate
    ? DateTime.fromJSDate(
        tripDayDate instanceof Date ? tripDayDate : new Date(String(tripDayDate)),
        { zone: 'utc' },
      ).startOf('day')
    : DateTime.now().setZone(timezone).startOf('day');

  const startDt = dayStart
    .setZone(timezone)
    .plus({ hours: spec.startHour, minutes: spec.startMinute });
  const endDt = dayStart.setZone(timezone).plus({ hours: spec.endHour, minutes: spec.endMinute });
  return {
    startTime: startDt.toUTC().toISO()!,
    endTime: endDt.toUTC().toISO()!,
    localLabel: `${startDt.toFormat('HH:mm')}–${endDt.toFormat('HH:mm')}`,
  };
}

export function buildItineraryItemUpdateAnswerText(
  spec: ItineraryItemUpdateSpec,
  updated: boolean,
  opts?: {
    dayNumber?: number;
    placeName?: string;
    localLabel?: string;
    usedDayFallback?: boolean;
    invalidTime?: boolean;
  },
): string {
  const requestedDay = spec.dayNumber ? `第${spec.dayNumber}天` : '行程中';
  const matchedDay = opts?.dayNumber ?? spec.dayNumber;
  const dayPart = matchedDay ? `第${matchedDay}天` : '行程中';
  const namePart = opts?.placeName ? `「${opts.placeName}」` : `「${spec.poiQuery}」`;
  const timePart =
    opts?.localLabel ??
    (spec.endHour != null && spec.endMinute != null
      ? `${padHm(spec.startHour, spec.startMinute)}–${padHm(spec.endHour, spec.endMinute)}`
      : `${padHm(spec.startHour, spec.startMinute)}起`);

  if (opts?.invalidTime) {
    return `结束时间需晚于开始时间，请重新说明 ${namePart} 的安排时段。`;
  }
  if (!updated) {
    return `未在${requestedDay}找到与${namePart}匹配的行程项，请检查名称或天数。`;
  }
  if (opts?.usedDayFallback && spec.dayNumber && matchedDay && matchedDay !== spec.dayNumber) {
    return `未在${requestedDay}找到${namePart}，已将${dayPart}的该行程项时间调整为 ${timePart}。`;
  }
  return `已将${dayPart}${namePart}的行程时间调整为 ${timePart}。`;
}
