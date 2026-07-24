/**
 * 绑定 Trip 上的「整日重排」短路（如黄金圈一日），直接 trip.applyEdit 落库。
 */

import { DateTime } from 'luxon';
import {
  goldenCircleEntityStrongMatch,
  keywordMatchResearchPoiToSlug,
} from '../../planning-policy/utils/anchor-entity-match.util';
import { ICELAND_POI_SLUG_KEYWORDS } from '../../planning-policy/regions/iceland-poi-slugs';
import { ICELAND_ANCHOR_DWELL_DEFAULTS_MIN } from '../../planning-policy/regions/iceland-region-intents';
import {
  detectItineraryAdjustIntent,
  extractItineraryAdjustTargetDateFromMessage,
} from './itinerary-adjust-intent.util';
import { detectItineraryItemAddIntent } from './itinerary-item-add.util';
import { detectItineraryItemDeleteIntent } from './itinerary-item-delete.util';
import { detectItineraryItemUpdateIntent } from './itinerary-item-update.util';
import type { TripDayLikeForDelete, TripItemLikeForDelete, TripLikeForDelete } from './itinerary-item-delete.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

export const GOLDEN_CIRCLE_DAY_REPLAN_ANCHORS = ['thingvellir', 'geysir', 'gullfoss'] as const;

export type GoldenCircleAnchorSlug = (typeof GOLDEN_CIRCLE_DAY_REPLAN_ANCHORS)[number];

export type GoldenCircleDayReplanSpec = {
  regionId: 'golden_circle';
  targetDateIso?: string;
  anchorSlugs: readonly GoldenCircleAnchorSlug[];
};

export type GoldenCircleScheduleSlot = {
  slug: GoldenCircleAnchorSlug;
  startTime: string;
  endTime: string;
  localLabel: string;
};

const GOLDEN_CIRCLE_LOCAL_SLOTS: Array<{
  slug: GoldenCircleAnchorSlug;
  start: string;
  end: string;
}> = [
  { slug: 'thingvellir', start: '09:00', end: '10:30' },
  { slug: 'geysir', start: '11:00', end: '11:45' },
  { slug: 'gullfoss', start: '12:30', end: '13:15' },
];

const REPLAN_ITEM_TYPES_TO_REMOVE = new Set(['ACTIVITY', 'MEAL_FLOATING', 'MEAL_ANCHOR']);

function tripDays(trip: TripLikeForDelete): TripDayLikeForDelete[] {
  if (Array.isArray(trip.days) && trip.days.length) return trip.days;
  return trip.TripDay ?? [];
}

function dayItems(day: TripDayLikeForDelete): TripItemLikeForDelete[] {
  if (Array.isArray(day.items) && day.items.length) return day.items;
  return day.ItineraryItem ?? [];
}

export function formatTripDayDateIso(date: Date | string | null | undefined): string | undefined {
  if (!date) return undefined;
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  const s = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}

function hasGoldenCircleAnchorMention(t: string): boolean {
  if (/黄金圈|golden\s*circle/i.test(t)) return true;
  const hasThingvellir = /(?:辛格维利尔|thingvellir|þingvellir|pingvellir)/i.test(t);
  const hasGeysir = /(?:盖歇尔|geysir|间歇泉)/i.test(t);
  const hasGullfoss = /(?:黄金瀑布|gullfoss|古佛斯)/i.test(t);
  return hasThingvellir && hasGeysir && hasGullfoss;
}

function isFullDayReplanPhrase(t: string): boolean {
  return (
    /(?:更新|改为|调整|重排|替换).{0,32}(?:行程|日程)/.test(t) ||
    /(?:生成|产出).{0,12}(?:新(?:的)?)?(?:行程|草案|方案)/.test(t)
  );
}

/** 黄金圈整日重排：绑定 trip 改稿 + 三锚点 + 非单项 CRUD */
export function detectGoldenCircleDayReplanIntent(message: string): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim() || !detectItineraryAdjustIntent(t)) return false;
  if (!hasGoldenCircleAnchorMention(t)) return false;

  const crudIntent =
    detectItineraryItemDeleteIntent(t) ||
    detectItineraryItemAddIntent(t) ||
    detectItineraryItemUpdateIntent(t);
  if (crudIntent && !isFullDayReplanPhrase(t)) return false;

  return isFullDayReplanPhrase(t) || /黄金圈/i.test(t);
}

export function parseGoldenCircleDayReplanSpec(
  message: string,
  dateRange?: { start_date?: string; end_date?: string },
): GoldenCircleDayReplanSpec | null {
  if (!detectGoldenCircleDayReplanIntent(message)) return null;
  return {
    regionId: 'golden_circle',
    targetDateIso: extractItineraryAdjustTargetDateFromMessage(message, dateRange),
    anchorSlugs: [...GOLDEN_CIRCLE_DAY_REPLAN_ANCHORS],
  };
}

export function resolveTripDayByDate(
  trip: TripLikeForDelete,
  targetDateIso: string | undefined,
): {
  tripDayId?: string;
  dayNumber?: number;
  dateIso?: string;
  items: TripItemLikeForDelete[];
} {
  const days = tripDays(trip);
  if (!days.length) return { items: [] };

  if (targetDateIso) {
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const dateIso = formatTripDayDateIso(day.date);
      if (dateIso === targetDateIso) {
        return {
          tripDayId: day.id?.trim(),
          dayNumber: i + 1,
          dateIso,
          items: dayItems(day),
        };
      }
    }
    return { items: [] };
  }

  const last = days[days.length - 1];
  return {
    tripDayId: last.id?.trim(),
    dayNumber: days.length,
    dateIso: formatTripDayDateIso(last.date),
    items: dayItems(last),
  };
}

export function collectActivityItemIdsForDayReplan(items: TripItemLikeForDelete[]): string[] {
  return items
    .filter((it) => {
      const type = String((it as { type?: string }).type ?? 'ACTIVITY');
      return REPLAN_ITEM_TYPES_TO_REMOVE.has(type);
    })
    .map((it) => String(it.id ?? '').trim())
    .filter(Boolean);
}

export function buildGoldenCircleScheduleSlots(
  tripDayDate: Date | string | null | undefined,
  timezone = 'Atlantic/Reykjavik',
): GoldenCircleScheduleSlot[] {
  const dayStart = tripDayDate
    ? DateTime.fromJSDate(
        tripDayDate instanceof Date ? tripDayDate : new Date(String(tripDayDate)),
        { zone: 'utc' },
      ).startOf('day')
    : DateTime.now().setZone(timezone).startOf('day');

  return GOLDEN_CIRCLE_LOCAL_SLOTS.map(({ slug, start, end }) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startDt = dayStart.setZone(timezone).set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const endDt = dayStart.setZone(timezone).set({ hour: eh, minute: em, second: 0, millisecond: 0 });
    return {
      slug,
      startTime: startDt.toUTC().toISO()!,
      endTime: endDt.toUTC().toISO()!,
      localLabel: `${start}–${end}`,
    };
  });
}

export type PoiCandidateLike = {
  id?: number;
  poi_id?: string | number;
  name?: string | null;
  nameCN?: string | null;
  nameEN?: string | null;
};

export function resolveGoldenCirclePlaceIdsFromTrip(
  trip: TripLikeForDelete,
): Partial<Record<GoldenCircleAnchorSlug, number>> {
  const found: Partial<Record<GoldenCircleAnchorSlug, number>> = {};
  for (const day of tripDays(trip)) {
    for (const item of dayItems(day)) {
      const place = item.Place ?? item.place;
      if (place?.id == null) continue;
      for (const slug of GOLDEN_CIRCLE_DAY_REPLAN_ANCHORS) {
        if (found[slug] != null) continue;
        if (goldenCircleEntityStrongMatch(place, slug) || keywordMatchResearchPoiToSlug(place, slug)) {
          found[slug] = place.id;
        }
      }
    }
  }
  return found;
}

export function pickGoldenCirclePlaceFromCandidates(
  slug: GoldenCircleAnchorSlug,
  candidates: PoiCandidateLike[],
): number | undefined {
  for (const p of candidates) {
    if (goldenCircleEntityStrongMatch(p, slug) || keywordMatchResearchPoiToSlug(p, slug)) {
      const id = Number(p.id ?? p.poi_id);
      if (Number.isFinite(id)) return id;
    }
  }
  return undefined;
}

export function goldenCircleSearchQueryForSlug(slug: GoldenCircleAnchorSlug): string {
  if (slug === 'geysir') {
    return 'Strokkur Haukadalur Geysir geothermal area';
  }
  const kws = ICELAND_POI_SLUG_KEYWORDS[slug];
  return kws?.[0] ?? slug;
}

export function buildGoldenCircleDayReplanAnswerText(params: {
  dayNumber?: number;
  targetDateIso?: string;
  placeNames: string[];
  deletedCount: number;
  addedCount: number;
}): string {
  const dayLabel = params.targetDateIso
    ? formatMonthDayLabel(params.targetDateIso)
    : params.dayNumber != null
      ? `第${params.dayNumber}天`
      : '当日';
  const route = params.placeNames.filter(Boolean).join(' → ');
  if (params.addedCount >= 3) {
    return `已将${dayLabel}行程更新为黄金圈一日游：${route}。共替换 ${params.deletedCount} 个旧活动，新增 ${params.addedCount} 个景点。请在时间轴查看。`;
  }
  if (params.addedCount > 0) {
    return `已部分更新${dayLabel}黄金圈行程（${route}）。请在时间轴查看并确认。`;
  }
  return `未能为${dayLabel}写入黄金圈行程，请稍后重试或手动调整。`;
}

export function goldenCircleDwellMinutes(slug: GoldenCircleAnchorSlug): number {
  return ICELAND_ANCHOR_DWELL_DEFAULTS_MIN[slug]?.recommended ?? 45;
}

function formatMonthDayLabel(iso: string): string {
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return iso;
  return `${month}月${day}日`;
}
