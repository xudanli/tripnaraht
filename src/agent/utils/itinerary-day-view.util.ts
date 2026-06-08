/**
 * 绑定 Trip：「查看第 N 天行程」只读意图（读库展示，非改稿/重规划）。
 */

import { extractItineraryAdjustTargetDateFromMessage } from './itinerary-adjust-intent.util';
import { detectItineraryItemAddIntent, parseTripDayNumber } from './itinerary-item-add.util';
import { detectItineraryItemDeleteIntent } from './itinerary-item-delete.util';
import { detectItineraryItemUpdateIntent } from './itinerary-item-update.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

const VIEW_VERB_RE =
  /(?:查看|看看|查询|显示|展示|告诉我|说下|说一下)|(?:\b(?:look\s*at|show|view|display)\b|what\s+(?:is|are)\s+(?:on|for))/i;

const EDIT_VERB_RE =
  /(?:修改|调整|重排|替换|改行程|更新|重写|重新生成|删除|移除|新增|添加|加上|加入|插入|生成|产出).{0,12}(?:新(?:的)?)?(?:行程|草案|方案)/;

export type ItineraryDayViewSpec = {
  dayNumber?: number;
  targetDateIso?: string;
};

export type ItineraryDayViewItemLike = {
  type?: string;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  note?: string | null;
  Place?: { nameCN?: string | null; nameEN?: string | null } | null;
  place?: { nameCN?: string | null; nameEN?: string | null } | null;
  crossDayInfo?: { isCheckoutItem?: boolean; displayMode?: string };
};

export function detectItineraryDayViewIntent(message: string): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim()) return false;
  if (EDIT_VERB_RE.test(t)) return false;
  if (
    detectItineraryItemDeleteIntent(t) ||
    detectItineraryItemAddIntent(t) ||
    detectItineraryItemUpdateIntent(t)
  ) {
    return false;
  }
  if (!VIEW_VERB_RE.test(t)) return false;

  const dayNumber = parseTripDayNumber(t);
  const hasDayAnchor =
    dayNumber != null ||
    /\bD\s*\d+\b/i.test(t) ||
    /\d{1,2}\s*月\s*\d{1,2}\s*日/.test(t) ||
    /\d{4}-\d{2}-\d{2}/.test(t);
  const hasItineraryAnchor = /(?:行程|日程|安排|计划|itinerary|schedule)/i.test(t);

  if (hasDayAnchor && hasItineraryAnchor) return true;
  if (dayNumber != null && /(?:第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天)/.test(t)) {
    return true;
  }
  return false;
}

export function parseItineraryDayViewSpec(
  message: string,
  dateRange?: { start_date?: string; end_date?: string },
): ItineraryDayViewSpec | null {
  if (!detectItineraryDayViewIntent(message)) return null;
  return {
    dayNumber: parseTripDayNumber(message),
    targetDateIso: extractItineraryAdjustTargetDateFromMessage(message, dateRange),
  };
}

function formatLocalHm(iso: Date | string | null | undefined): string {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '';
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function itemLabel(item: ItineraryDayViewItemLike): string {
  const place = item.Place ?? item.place;
  const fromPlace = place?.nameCN || place?.nameEN;
  if (fromPlace) return String(fromPlace);
  if (item.note?.trim()) return item.note.trim();
  if (item.type === 'TRANSIT') return '交通';
  if (item.type === 'REST') return '休息/住宿';
  return '活动';
}

function isCheckoutItem(item: ItineraryDayViewItemLike): boolean {
  return (
    item.crossDayInfo?.isCheckoutItem === true || item.crossDayInfo?.displayMode === 'checkout'
  );
}

export function buildItineraryDayViewAnswerText(params: {
  dayNumber: number;
  dateIso?: string;
  items: ItineraryDayViewItemLike[];
  tripTitle?: string;
}): string {
  const datePart = params.dateIso ? `（${params.dateIso}）` : '';
  const header = `第 ${params.dayNumber} 天${datePart}当前安排：`;

  if (!params.items.length) {
    return `${header}\n\n这一天还没有安排具体活动。可在左侧时间轴添加，或告诉我您想怎么调整。`;
  }

  const lines = params.items.map((item, idx) => {
    const label = itemLabel(item);
    const checkout = isCheckoutItem(item);
    const start = formatLocalHm(item.startTime);
    const end = formatLocalHm(item.endTime);
    const timePart =
      start && end ? `${start}–${end}` : start ? start : checkout ? '退房' : '时段待定';
    const tag = checkout ? '【退房】' : '';
    return `${idx + 1}. ${timePart} ${tag}${label}`.trim();
  });

  return `${header}\n\n${lines.join('\n')}\n\n详细时间与交通段请直接查看左侧时间轴。`;
}

export function resolveTripDayIndexFromViewSpec(
  tripDays: Array<{ date?: Date | string | null }>,
  spec: ItineraryDayViewSpec,
): number | undefined {
  if (!tripDays.length) return undefined;

  if (spec.targetDateIso) {
    const idx = tripDays.findIndex((d) => {
      const raw = d.date instanceof Date ? d.date.toISOString() : String(d.date ?? '');
      return raw.slice(0, 10) === spec.targetDateIso;
    });
    if (idx >= 0) return idx;
  }

  if (spec.dayNumber != null && spec.dayNumber >= 1 && spec.dayNumber <= tripDays.length) {
    return spec.dayNumber - 1;
  }

  return undefined;
}
