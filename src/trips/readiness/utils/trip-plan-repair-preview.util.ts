import { DateTime } from 'luxon';
import type { TripPlan } from '../../decision/plan-model';

export interface TripPlanSlotSnapshot {
  slotId: string;
  dayNumber: number;
  time: string;
  endTime?: string;
  title: string;
}

export type TripPlanItineraryChangeType =
  | 'added'
  | 'removed'
  | 'time_changed'
  | 'title_changed'
  | 'moved_day';

export interface TripPlanItineraryDiffEntry {
  slotId: string;
  changeType: TripPlanItineraryChangeType;
  dayNumber: number;
  before?: TripPlanSlotSnapshot;
  after?: TripPlanSlotSnapshot;
}

export function countTripPlanSlots(plan: TripPlan): number {
  return plan.days.reduce((n, day) => n + day.timeSlots.length, 0);
}

export function countTripPlanSlotsForDay(plan: TripPlan, dayNumber: number): number {
  const day = plan.days.find((d) => d.day === dayNumber);
  return day?.timeSlots.length ?? 0;
}

function indexTripPlanSlots(plan: TripPlan): Map<string, TripPlanSlotSnapshot> {
  const map = new Map<string, TripPlanSlotSnapshot>();
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      map.set(slot.id, {
        slotId: slot.id,
        dayNumber: day.day,
        time: slot.time,
        endTime: slot.endTime,
        title: slot.title,
      });
    }
  }
  return map;
}

export function buildTripPlanItineraryDiff(
  before: TripPlan,
  after: TripPlan,
): TripPlanItineraryDiffEntry[] {
  const beforeMap = indexTripPlanSlots(before);
  const afterMap = indexTripPlanSlots(after);
  const diff: TripPlanItineraryDiffEntry[] = [];

  for (const [slotId, b] of beforeMap) {
    const a = afterMap.get(slotId);
    if (!a) {
      diff.push({ slotId, changeType: 'removed', dayNumber: b.dayNumber, before: b });
      continue;
    }
    if (a.dayNumber !== b.dayNumber) {
      diff.push({ slotId, changeType: 'moved_day', dayNumber: a.dayNumber, before: b, after: a });
      continue;
    }
    if (a.time !== b.time || a.endTime !== b.endTime) {
      diff.push({ slotId, changeType: 'time_changed', dayNumber: a.dayNumber, before: b, after: a });
      continue;
    }
    if (a.title !== b.title) {
      diff.push({ slotId, changeType: 'title_changed', dayNumber: a.dayNumber, before: b, after: a });
    }
  }

  for (const [slotId, a] of afterMap) {
    if (!beforeMap.has(slotId)) {
      diff.push({ slotId, changeType: 'added', dayNumber: a.dayNumber, after: a });
    }
  }

  return diff;
}

export function itineraryDiffToHighlights(diff: TripPlanItineraryDiffEntry[], limit = 8): string[] {
  return diff.slice(0, limit).map((entry) => {
    switch (entry.changeType) {
      case 'removed':
        return `移除 ${entry.before?.title ?? entry.slotId}`;
      case 'added':
        return `新增 ${entry.after?.title ?? entry.slotId}`;
      case 'time_changed':
        return `${entry.after?.title ?? entry.slotId}: ${entry.before?.time ?? '?'} → ${entry.after?.time ?? '?'}`;
      case 'moved_day':
        return `${entry.after?.title ?? entry.slotId}: Day ${entry.before?.dayNumber} → Day ${entry.after?.dayNumber}`;
      case 'title_changed':
        return `${entry.before?.title} → ${entry.after?.title}`;
      default:
        return entry.slotId;
    }
  });
}

function cloneTripPlan(plan: TripPlan): TripPlan {
  return JSON.parse(JSON.stringify(plan)) as TripPlan;
}

function resolveTargetDayNumber(payload: Record<string, unknown>): number | undefined {
  const suggested = payload.suggestedValue;
  if (suggested && typeof suggested === 'object' && 'dayNumber' in suggested) {
    const dayNumber = (suggested as { dayNumber?: unknown }).dayNumber;
    if (typeof dayNumber === 'number' && Number.isFinite(dayNumber)) return dayNumber;
  }
  if (typeof payload.dayNumber === 'number') return payload.dayNumber;
  return undefined;
}

function extractSlotFromPlan(
  plan: TripPlan,
  itemId: string,
): { slot: TripPlan['days'][0]['timeSlots'][0]; fromDayNumber: number } | undefined {
  for (const day of plan.days) {
    const idx = day.timeSlots.findIndex((s) => s.id === itemId);
    if (idx >= 0) {
      return { slot: day.timeSlots.splice(idx, 1)[0], fromDayNumber: day.day };
    }
  }
  return undefined;
}

function ensurePlanDay(plan: TripPlan, dayNumber: number): TripPlan['days'][0] {
  let day = plan.days.find((d) => d.day === dayNumber);
  if (day) return day;

  const sorted = [...plan.days].sort((a, b) => a.day - b.day);
  const anchor = sorted.find((d) => d.day < dayNumber) ?? sorted[sorted.length - 1];
  const anchorDate = anchor?.date ?? plan.days[0]?.date ?? '2026-06-01';
  const offset = dayNumber - (anchor?.day ?? 1);
  const date = DateTime.fromISO(String(anchorDate)).plus({ days: offset }).toISODate() ?? anchorDate;

  day = { day: dayNumber, date, timeSlots: [] };
  plan.days.push(day);
  plan.days.sort((a, b) => a.day - b.day);
  return day;
}

function applyMoveToDay(plan: TripPlan, payload: Record<string, unknown>): TripPlan {
  const itemId =
    (typeof payload.itemId === 'string' ? payload.itemId : undefined) ??
    (typeof payload.toItemId === 'string' ? payload.toItemId : undefined);
  const dayNumber = resolveTargetDayNumber(payload);
  if (!itemId || !dayNumber) return plan;

  const extracted = extractSlotFromPlan(plan, itemId);
  if (!extracted) return plan;

  const targetDay = ensurePlanDay(plan, dayNumber);
  targetDay.timeSlots.push(extracted.slot);
  targetDay.timeSlots.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return plan;
}

function applyMidpointOvernight(plan: TripPlan, payload: Record<string, unknown>): TripPlan {
  const anchors = (payload.anchors ?? {}) as Record<string, unknown>;
  const toItemId =
    (typeof payload.toItemId === 'string' ? payload.toItemId : undefined) ??
    (typeof anchors.toItemId === 'string' ? anchors.toItemId : undefined);
  const fromLabel =
    typeof anchors.fromPlaceLabel === 'string' ? anchors.fromPlaceLabel : '起点';
  const toLabel =
    typeof anchors.toPlaceLabel === 'string' ? anchors.toPlaceLabel : '终点';

  if (!toItemId) return plan;

  const extracted = extractSlotFromPlan(plan, toItemId);
  if (!extracted) return plan;

  const stayDayNumber = extracted.fromDayNumber;
  const nextDayNumber = stayDayNumber + 1;
  const stayDay = ensurePlanDay(plan, stayDayNumber);
  const nextDay = ensurePlanDay(plan, nextDayNumber);

  const midpointId = `midpoint-stay-${payload.segmentId ?? stayDayNumber}`;
  if (!stayDay.timeSlots.some((s) => s.id === midpointId)) {
    stayDay.timeSlots.push({
      id: midpointId,
      time: '20:00',
      title: `中途住宿（${fromLabel} → ${toLabel}）`,
      type: 'hotel',
    });
    stayDay.timeSlots.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }

  nextDay.timeSlots.push(extracted.slot);
  nextDay.timeSlots.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return plan;
}

function applyReorderSplit(plan: TripPlan, payload: Record<string, unknown>): TripPlan {
  const toItemId = typeof payload.toItemId === 'string' ? payload.toItemId : undefined;
  if (toItemId) {
    const dayNumber = resolveTargetDayNumber(payload) ?? undefined;
    if (dayNumber) {
      return applyMoveToDay(plan, { ...payload, itemId: toItemId, suggestedValue: { dayNumber } });
    }
  }
  return plan;
}

function applyAlternativeRouteBuffer(plan: TripPlan, payload: Record<string, unknown>): TripPlan {
  const toItemId = typeof payload.toItemId === 'string' ? payload.toItemId : undefined;
  if (!toItemId) return plan;

  for (const day of plan.days) {
    const slot = day.timeSlots.find((s) => s.id === toItemId);
    if (!slot) continue;
    const bumped = DateTime.fromFormat(String(slot.time), 'HH:mm').plus({ minutes: 30 });
    if (bumped.isValid) {
      slot.time = bumped.toFormat('HH:mm') as TripPlan['days'][0]['timeSlots'][0]['time'];
    }
    break;
  }
  return plan;
}

/** road_class 等结构性 Plan B — 基于 option payload 本地模拟（不依赖 Neptune DAG） */
export function applyStructuralRepairToPlan(
  before: TripPlan,
  input: { actionType: string; payload?: Record<string, unknown> },
): TripPlan {
  const plan = cloneTripPlan(before);
  const payload = input.payload ?? {};

  switch (input.actionType) {
    case 'move_to_day':
      return applyMoveToDay(plan, payload);
    case 'change_hotel':
      return applyMidpointOvernight(plan, payload);
    case 'reorder_pois':
      return applyReorderSplit(plan, payload);
    case 'find_alternative_route':
      return applyAlternativeRouteBuffer(plan, payload);
    default:
      return plan;
  }
}
