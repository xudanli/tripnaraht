/**
 * SOFT 约束 — 基于日程的模板级评估（不进 hard feasibility）
 */

import { DateTime } from 'luxon';
import type { TripConstraint } from '../types/trip-constraint.types';
import { getConstraintTemplate } from './constraint-template-registry.util';

export interface SoftScheduleDayItem {
  id: string;
  type?: string | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  note?: string | null;
  placeName?: string;
  placeMetadata?: Record<string, unknown>;
}

export interface SoftScheduleEvalContext {
  days: Array<{
    dayNumber: number;
    dateIso: string;
    items: SoftScheduleDayItem[];
  }>;
  budgetTotal?: number;
  budgetCurrency?: string;
}

export interface SoftConstraintViolation {
  constraintId: string;
  templateId?: string;
  dayNumber?: number;
  message: string;
  suggestedResolution?: string;
}

function templateIdOf(c: TripConstraint): string | undefined {
  if (c.source.templateId) return c.source.templateId;
  if (c.value && typeof c.value === 'object') {
    const tid = (c.value as Record<string, unknown>).templateId;
    if (typeof tid === 'string' && tid.length > 0) return tid;
  }
  return undefined;
}

function rawValue(c: TripConstraint): Record<string, unknown> {
  return c.value && typeof c.value === 'object' ? (c.value as Record<string, unknown>) : {};
}

function parseHmOnDay(dateIso: string, hm: string): DateTime | undefined {
  const dt = DateTime.fromISO(`${dateIso}T${hm}`, { setZone: true });
  return dt.isValid ? dt : undefined;
}

function itemStart(dateIso: string, item: SoftScheduleDayItem): DateTime | undefined {
  if (!item.startTime) return undefined;
  if (item.startTime instanceof Date) {
    return DateTime.fromJSDate(item.startTime);
  }
  if (typeof item.startTime === 'string') {
    if (item.startTime.includes('T')) {
      const dt = DateTime.fromISO(item.startTime);
      return dt.isValid ? dt : undefined;
    }
    return parseHmOnDay(dateIso, item.startTime);
  }
  return undefined;
}

function itemEnd(dateIso: string, item: SoftScheduleDayItem): DateTime | undefined {
  if (item.endTime) {
    if (item.endTime instanceof Date) return DateTime.fromJSDate(item.endTime);
    if (typeof item.endTime === 'string') {
      if (item.endTime.includes('T')) {
        const dt = DateTime.fromISO(item.endTime);
        return dt.isValid ? dt : undefined;
      }
      return parseHmOnDay(dateIso, item.endTime);
    }
  }
  return itemStart(dateIso, item);
}

function isMealItem(item: SoftScheduleDayItem): boolean {
  const type = String(item.type ?? '').toUpperCase();
  return type.includes('MEAL') || type.includes('LUNCH') || type.includes('DINNER');
}

function isMajorActivity(item: SoftScheduleDayItem): boolean {
  const type = String(item.type ?? '').toUpperCase();
  if (!type) return true;
  if (isMealItem(item)) return false;
  if (type.includes('TRANSPORT') || type.includes('TRAVEL') || type.includes('REST')) {
    return false;
  }
  return true;
}

function isHotelItem(item: SoftScheduleDayItem): boolean {
  const type = String(item.type ?? '').toUpperCase();
  const note = String(item.note ?? '');
  if (/hotel|住宿|lodging/i.test(note) || /\[timelineDisplayRole:hotel\]/i.test(note)) {
    return true;
  }
  return type.includes('HOTEL') || type.includes('LODGING') || type.includes('ACCOMMODATION');
}

function isShoppingItem(item: SoftScheduleDayItem): boolean {
  const type = String(item.type ?? '').toUpperCase();
  const text = `${item.placeName ?? ''} ${item.note ?? ''}`.toLowerCase();
  return type.includes('SHOP') || /购物|mall|market|store/.test(text);
}

function isNatureItem(item: SoftScheduleDayItem): boolean {
  const text = `${item.placeName ?? ''} ${item.note ?? ''} ${JSON.stringify(item.placeMetadata ?? {})}`.toLowerCase();
  return /瀑布|冰川|火山|national park|waterfall|glacier|nature|scenic|景观|自然/.test(text);
}

function evalPoiPreference(
  c: TripConstraint,
  ctx: SoftScheduleEvalContext,
  templateId?: string,
): SoftConstraintViolation[] {
  let shopping = 0;
  let major = 0;
  let nature = 0;
  for (const day of ctx.days) {
    for (const item of day.items) {
      if (!isMajorActivity(item)) continue;
      major += 1;
      if (isShoppingItem(item)) shopping += 1;
      if (isNatureItem(item)) nature += 1;
    }
  }
  if (templateId === 'less_shopping' && shopping >= 2) {
    return [
      {
        constraintId: c.id,
        templateId,
        message: `行程含 ${shopping} 处购物相关安排，与「少购物」偏好冲突`,
        suggestedResolution: `减少购物停留或降低「${c.name}」重要程度`,
      },
    ];
  }
  if (templateId === 'prefer_nature_scenery' && major >= 3 && nature === 0) {
    return [
      {
        constraintId: c.id,
        templateId,
        message: '主要活动以城市/通用 POI 为主，自然景观偏少',
        suggestedResolution: `增加自然景观 POI 或降低「${c.name}」重要程度`,
      },
    ];
  }
  if (templateId === 'attractions_over_shopping' && shopping > 0 && shopping >= major - shopping) {
    return [
      {
        constraintId: c.id,
        templateId,
        message: '购物停留与景点数量接近，景点优先偏好可能未满足',
        suggestedResolution: `减少购物或降低「${c.name}」重要程度`,
      },
    ];
  }
  return [];
}

function isRestItem(item: SoftScheduleDayItem): boolean {
  const type = String(item.type ?? '').toUpperCase();
  return type.includes('REST') || /休息|nap/i.test(String(item.note ?? ''));
}

function evalDailyCount(
  c: TripConstraint,
  ctx: SoftScheduleEvalContext,
): SoftConstraintViolation[] {
  const maxCount = Number(rawValue(c).maxCount ?? 3);
  const out: SoftConstraintViolation[] = [];
  for (const day of ctx.days) {
    const count = day.items.filter(isMajorActivity).length;
    if (count > maxCount) {
      out.push({
        constraintId: c.id,
        templateId: templateIdOf(c),
        dayNumber: day.dayNumber,
        message: `Day ${day.dayNumber} 安排了 ${count} 个主要活动，超过上限 ${maxCount} 个`,
        suggestedResolution: `降低「${c.name}」重要程度或移除部分景点`,
      });
    }
  }
  return out;
}

function evalDailyFreeTime(
  c: TripConstraint,
  ctx: SoftScheduleEvalContext,
): SoftConstraintViolation[] {
  const minMinutes = Number(rawValue(c).minMinutes ?? 60);
  const out: SoftConstraintViolation[] = [];
  for (const day of ctx.days) {
    const timed = day.items
      .map((item) => ({
        item,
        start: itemStart(day.dateIso, item),
        end: itemEnd(day.dateIso, item),
      }))
      .filter((x) => x.start && x.end) as Array<{
      item: SoftScheduleDayItem;
      start: DateTime;
      end: DateTime;
    }>;
    timed.sort((a, b) => a.start.toMillis() - b.start.toMillis());
    let freeMinutes = 0;
    for (let i = 1; i < timed.length; i++) {
      const gap = timed[i].start.diff(timed[i - 1].end, 'minutes').minutes;
      if (gap > 0) freeMinutes += gap;
    }
    if (timed.length >= 2 && freeMinutes < minMinutes) {
      out.push({
        constraintId: c.id,
        templateId: templateIdOf(c),
        dayNumber: day.dayNumber,
        message: `Day ${day.dayNumber} 自由缓冲约 ${Math.round(freeMinutes)} 分钟，低于 ${minMinutes} 分钟`,
        suggestedResolution: `降低「${c.name}」重要程度或精简当日安排`,
      });
    }
  }
  return out;
}

function evalLunchWindow(
  c: TripConstraint,
  ctx: SoftScheduleEvalContext,
): SoftConstraintViolation[] {
  const start = String(rawValue(c).startTime ?? '12:00');
  const end = String(rawValue(c).endTime ?? '13:30');
  const out: SoftConstraintViolation[] = [];
  for (const day of ctx.days) {
    const meals = day.items.filter(isMealItem);
    if (meals.length === 0) continue;
    const lunch = meals[0];
    const at = itemStart(day.dateIso, lunch);
    if (!at) continue;
    const windowStart = parseHmOnDay(day.dateIso, start);
    const windowEnd = parseHmOnDay(day.dateIso, end);
    if (!windowStart || !windowEnd) continue;
    if (at < windowStart || at > windowEnd) {
      out.push({
        constraintId: c.id,
        templateId: templateIdOf(c),
        dayNumber: day.dayNumber,
        message: `Day ${day.dayNumber} 午餐 ${at.toFormat('HH:mm')} 不在 ${start}–${end} 窗口内`,
        suggestedResolution: `调整午餐时间或降低「${c.name}」重要程度`,
      });
    }
  }
  return out;
}

function evalAvoidEarly(
  c: TripConstraint,
  ctx: SoftScheduleEvalContext,
): SoftConstraintViolation[] {
  const earliest = String(rawValue(c).earliestTime ?? '08:30');
  const out: SoftConstraintViolation[] = [];
  for (const day of ctx.days) {
    const first = day.items[0];
    if (!first) continue;
    const at = itemStart(day.dateIso, first);
    const threshold = parseHmOnDay(day.dateIso, earliest);
    if (!at || !threshold) continue;
    if (at < threshold) {
      out.push({
        constraintId: c.id,
        templateId: templateIdOf(c),
        dayNumber: day.dayNumber,
        message: `Day ${day.dayNumber} 首项 ${at.toFormat('HH:mm')} 早于 ${earliest}`,
        suggestedResolution: `推迟出发或降低「${c.name}」重要程度`,
      });
    }
  }
  return out;
}

function evalElderlyRest(
  c: TripConstraint,
  ctx: SoftScheduleEvalContext,
): SoftConstraintViolation[] {
  const start = String(rawValue(c).startTime ?? '14:00');
  const duration = Number(rawValue(c).durationMinutes ?? 90);
  const out: SoftConstraintViolation[] = [];
  for (const day of ctx.days) {
    const windowStart = parseHmOnDay(day.dateIso, start);
    if (!windowStart) continue;
    const windowEnd = windowStart.plus({ minutes: duration });
    const hasRest = day.items.some((item) => {
      if (!isRestItem(item)) return false;
      const at = itemStart(day.dateIso, item);
      return at != null && at >= windowStart && at <= windowEnd;
    });
    if (!hasRest && day.items.length >= 3) {
      out.push({
        constraintId: c.id,
        templateId: templateIdOf(c),
        dayNumber: day.dayNumber,
        message: `Day ${day.dayNumber} 下午 ${start} 起未安排老人休息`,
        suggestedResolution: `插入休息时段或降低「${c.name}」重要程度`,
      });
    }
  }
  return out;
}

function evalLodgingContinuity(
  c: TripConstraint,
  ctx: SoftScheduleEvalContext,
): SoftConstraintViolation[] {
  const hotelsByDay = ctx.days.map((day) => {
    const hotel = day.items.find(isHotelItem);
    return hotel?.placeName ?? hotel?.note ?? undefined;
  });
  let changes = 0;
  for (let i = 1; i < hotelsByDay.length; i++) {
    const prev = hotelsByDay[i - 1];
    const cur = hotelsByDay[i];
    if (prev && cur && prev !== cur) changes += 1;
  }
  if (hotelsByDay.filter(Boolean).length >= 2 && changes >= 2) {
    return [
      {
        constraintId: c.id,
        templateId: templateIdOf(c),
        message: `行程含 ${changes} 次换宿，与「少换酒店」偏好冲突`,
        suggestedResolution: `合并住宿或降低「${c.name}」重要程度`,
      },
    ];
  }
  return [];
}

export function buildSoftScheduleEvalContext(input: {
  TripDay?: Array<{
    date: Date;
    ItineraryItem?: Array<{
      id: string;
      type?: string | null;
      startTime?: Date | null;
      endTime?: Date | null;
      note?: string | null;
      Place?: { nameCN?: string | null; nameEN?: string | null } | null;
    }>;
  }>;
  budgetConfig?: unknown;
}): SoftScheduleEvalContext {
  const days = (input.TripDay ?? []).map((day, index) => ({
    dayNumber: index + 1,
    dateIso: DateTime.fromJSDate(day.date).toISODate() ?? String(index + 1),
    items: (day.ItineraryItem ?? []).map((item) => ({
      id: item.id,
      type: item.type,
      startTime: item.startTime,
      endTime: item.endTime,
      note: item.note,
      placeName: item.Place?.nameCN ?? item.Place?.nameEN ?? undefined,
      placeMetadata:
        (item.Place as { metadata?: unknown } | null | undefined)?.metadata &&
        typeof (item.Place as { metadata?: unknown }).metadata === 'object'
          ? ((item.Place as { metadata: Record<string, unknown> }).metadata)
          : undefined,
    })),
  }));
  const budget =
    input.budgetConfig && typeof input.budgetConfig === 'object'
      ? (input.budgetConfig as Record<string, unknown>)
      : {};
  const total = Number(budget.total ?? budget.amount);
  return {
    days,
    ...(Number.isFinite(total) ? { budgetTotal: total, budgetCurrency: String(budget.currency ?? 'CNY') } : {}),
  };
}

export function evaluateSoftConstraintsOnSchedule(
  constraints: TripConstraint[],
  ctx: SoftScheduleEvalContext,
): SoftConstraintViolation[] {
  const violations: SoftConstraintViolation[] = [];
  for (const c of constraints) {
    if (c.type !== 'SOFT' || c.status === 'DISABLED') continue;
    const tid = templateIdOf(c);
    const ruleKind = tid ? getConstraintTemplate(tid)?.solverRuleKind : undefined;
    switch (ruleKind) {
      case 'daily_count':
        violations.push(...evalDailyCount(c, ctx));
        break;
      case 'time_budget':
        violations.push(...evalDailyFreeTime(c, ctx));
        break;
      case 'time_window':
        if (tid === 'lunch_time_window') violations.push(...evalLunchWindow(c, ctx));
        else if (tid === 'avoid_early') violations.push(...evalAvoidEarly(c, ctx));
        else if (tid === 'elderly_rest') violations.push(...evalElderlyRest(c, ctx));
        break;
      case 'lodging_continuity':
        violations.push(...evalLodgingContinuity(c, ctx));
        break;
      case 'poi_preference':
        violations.push(...evalPoiPreference(c, ctx, tid));
        break;
      default:
        break;
    }
  }
  return violations;
}
