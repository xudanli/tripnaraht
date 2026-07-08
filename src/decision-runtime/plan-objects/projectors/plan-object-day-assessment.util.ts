/**
 * Phase 4 — PlanObject 日内轻量评估（STAY 衔接 / 午餐窗 / 日负荷）
 */

import type { PlanObject, PlanObjectAssessment } from '../contracts/plan-object.types';
import {
  buildLunchWindowConflictCopy,
  getMinLunchGapMinutes,
  type LunchStrategy,
} from '../../../planning-policy/utils/lunch-strategy.util';

const MAX_DAILY_TRANSFER_MINUTES = 360;
const MEAL_ARRIVAL_SLACK_MINUTES = 30;
const DEFAULT_BUFFER_MINUTES = Number(process.env.TRIP_CONFLICT_BUFFER_MINUTES) || 15;
const MAX_DAILY_FATIGUE_SCORE = 80;
const LUNCH_WINDOW_START_MIN = 11 * 60;
const LUNCH_WINDOW_END_MIN = 14 * 60;

function parseHm(hm?: string): number | null {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function precedingObject(objects: PlanObject[], target: PlanObject): PlanObject | undefined {
  const idx = objects.findIndex((o) => o.planObjectId === target.planObjectId);
  if (idx <= 0) return undefined;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const o = objects[i];
    if (o.type === 'TRANSFER' || o.type === 'VISIT' || o.type === 'ACTIVITY') return o;
  }
  return undefined;
}

export function assessStayLinkage(objects: PlanObject[], dayNumber: number): PlanObjectAssessment[] {
  const out: PlanObjectAssessment[] = [];
  const hasStay = objects.some((o) => o.type === 'STAY');
  const hasLateActivity = objects.some((o) => {
    const end = parseHm(o.endWindow);
    return (o.type === 'VISIT' || o.type === 'ACTIVITY') && end != null && end >= 20 * 60;
  });
  const last = objects[objects.length - 1];
  const endsWithStay = last?.type === 'STAY';

  if (!hasStay && hasLateActivity) {
    out.push({
      kind: 'STAY_LINKAGE',
      severity: 'WARNING',
      message: `Day ${dayNumber} 有晚间活动但未安排 STAY，需确认住宿衔接`,
      semanticKey: `plan_object_stay_missing_day_${dayNumber}`,
      details: { dayNumber, hasLateActivity: true },
    });
  }

  if (hasStay && !endsWithStay) {
    const stay = objects.find((o) => o.type === 'STAY');
    out.push({
      kind: 'STAY_LINKAGE',
      severity: 'INFO',
      planObjectId: stay?.planObjectId,
      message: `Day ${dayNumber} 有住宿但未排在日末，检查入住/退房时间`,
      semanticKey: `plan_object_stay_not_terminal_day_${dayNumber}`,
      details: { dayNumber, lastObjectType: last?.type },
    });
  }

  return out;
}

function isMealPlanObject(o: PlanObject): boolean {
  return o.type === 'MEAL_WINDOW' || o.type === 'DINING' || o.type === 'SUPPLY_STOP';
}

function objectEndMinutes(o: PlanObject): number | null {
  const start = parseHm(o.startWindow);
  if (start == null) return null;
  const end = parseHm(o.endWindow);
  if (end != null) return end;
  if (o.durationMinutes != null) return start + o.durationMinutes;
  return null;
}

function hasAdequateMealPlanned(objects: PlanObject[], minMinutes: number): boolean {
  for (const o of objects) {
    if (!isMealPlanObject(o)) continue;
    const start = parseHm(o.startWindow);
    const duration = o.durationMinutes ?? 0;
    if (start == null || duration < minMinutes) continue;
    if (start >= LUNCH_WINDOW_START_MIN - 30 && start <= LUNCH_WINDOW_END_MIN) return true;
  }
  return false;
}

/** 11:00–14:00 最长连续空档（分钟），替代 trip-conflicts.detectLunchWindow */
export function computeLunchFreeGapMinutes(objects: PlanObject[]): number {
  const occupied: Array<{ start: number; end: number }> = [];
  for (const o of objects) {
    if (isMealPlanObject(o)) continue;
    const start = parseHm(o.startWindow);
    const end = objectEndMinutes(o);
    if (start == null || end == null) continue;
    const clipStart = Math.max(start, LUNCH_WINDOW_START_MIN);
    const clipEnd = Math.min(end, LUNCH_WINDOW_END_MIN);
    if (clipEnd > clipStart) occupied.push({ start: clipStart, end: clipEnd });
  }

  if (occupied.length === 0) return LUNCH_WINDOW_END_MIN - LUNCH_WINDOW_START_MIN;

  occupied.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [occupied[0]];
  for (let i = 1; i < occupied.length; i += 1) {
    const last = merged[merged.length - 1];
    if (occupied[i].start <= last.end) {
      last.end = Math.max(last.end, occupied[i].end);
    } else {
      merged.push(occupied[i]);
    }
  }

  let maxGap = merged[0].start - LUNCH_WINDOW_START_MIN;
  for (let i = 1; i < merged.length; i += 1) {
    maxGap = Math.max(maxGap, merged[i].start - merged[i - 1].end);
  }
  maxGap = Math.max(maxGap, LUNCH_WINDOW_END_MIN - merged[merged.length - 1].end);
  return Math.max(0, maxGap);
}

export function assessMealWindowGap(
  objects: PlanObject[],
  dayNumber: number,
  lunchStrategy: LunchStrategy,
): PlanObjectAssessment[] {
  const minRequired = getMinLunchGapMinutes(lunchStrategy);
  if (hasAdequateMealPlanned(objects, minRequired)) return [];

  const gapMinutes = computeLunchFreeGapMinutes(objects);
  if (gapMinutes >= minRequired) return [];

  const copy = buildLunchWindowConflictCopy({
    strategy: lunchStrategy,
    durationMinutes: gapMinutes,
    minRequired,
  });
  const meal = objects.find((o) => o.type === 'MEAL_WINDOW');

  return [
    {
      kind: 'MEAL_WINDOW_GAP',
      severity: lunchStrategy === 'rigid' ? 'BLOCK' : 'WARNING',
      planObjectId: meal?.planObjectId,
      message: copy.description,
      semanticKey: `plan_object_meal_gap_day_${dayNumber}`,
      details: { dayNumber, gapMinutes, minRequired, lunchStrategy },
    },
  ];
}

export function assessMealWindowVsArrival(objects: PlanObject[]): PlanObjectAssessment[] {
  const out: PlanObjectAssessment[] = [];
  for (const meal of objects.filter((o) => o.type === 'MEAL_WINDOW' || o.type === 'DINING')) {
    const mealStart = parseHm(meal.startWindow);
    if (mealStart == null) continue;
    const prev = precedingObject(objects, meal);
    if (!prev) continue;
    const prevEnd = parseHm(prev.endWindow);
    if (prevEnd == null) continue;
    if (prevEnd > mealStart + MEAL_ARRIVAL_SLACK_MINUTES) {
      out.push({
        kind: 'MEAL_WINDOW_VS_ARRIVAL',
        severity: 'WARNING',
        planObjectId: meal.planObjectId,
        message: `预计 ${prev.locationLabel ?? '上一站'} 结束于 ${prev.endWindow}，晚于午餐窗 ${meal.startWindow}`,
        semanticKey: `plan_object_meal_late_arrival_${meal.planObjectId}`,
        details: {
          precedingPlanObjectId: prev.planObjectId,
          precedingEnd: prev.endWindow,
          mealStart: meal.startWindow,
          slackMinutes: MEAL_ARRIVAL_SLACK_MINUTES,
        },
      });
    }
  }
  return out;
}

function isSchedulableObject(o: PlanObject): boolean {
  return (
    o.type === 'VISIT' ||
    o.type === 'ACTIVITY' ||
    o.type === 'TRANSFER' ||
    o.type === 'DINING' ||
    o.type === 'STAY'
  );
}

/** 相邻 PlanObject 缓冲不足 — 替代 trip-conflicts BUFFER_INSUFFICIENT */
export function assessBufferLinkage(objects: PlanObject[], dayNumber: number): PlanObjectAssessment[] {
  const out: PlanObjectAssessment[] = [];
  const schedulable = objects.filter(isSchedulableObject);
  for (let i = 0; i < schedulable.length - 1; i += 1) {
    const current = schedulable[i];
    const next = schedulable[i + 1];
    const currentEnd = objectEndMinutes(current);
    const nextStart = parseHm(next.startWindow);
    if (currentEnd == null || nextStart == null) continue;
    const gap = nextStart - currentEnd;
    if (gap <= 0 || gap >= DEFAULT_BUFFER_MINUTES) continue;
    out.push({
      kind: 'BUFFER_LINKAGE',
      severity: 'WARNING',
      planObjectId: next.planObjectId,
      message: `「${current.locationLabel ?? current.type}」到「${next.locationLabel ?? next.type}」缓冲仅 ${gap} 分钟`,
      semanticKey: `plan_object_buffer_day_${dayNumber}_${current.planObjectId}_${next.planObjectId}`,
      details: {
        dayNumber,
        fromPlanObjectId: current.planObjectId,
        toPlanObjectId: next.planObjectId,
        gapMinutes: gap,
        minBufferMinutes: DEFAULT_BUFFER_MINUTES,
      },
    });
  }
  return out;
}

/** 日疲劳累计 — 替代 trip-conflicts FATIGUE_EXCEEDED */
export function assessDailyFatigueLoad(objects: PlanObject[], dayNumber: number): PlanObjectAssessment[] {
  let totalFatigue = 0;
  for (const o of objects) {
    const score = o.metadata?.fatigueScore;
    if (typeof score === 'number' && Number.isFinite(score)) {
      totalFatigue += score;
    }
  }
  if (totalFatigue <= MAX_DAILY_FATIGUE_SCORE) return [];
  return [
    {
      kind: 'DAILY_FATIGUE_LOAD',
      severity: totalFatigue > MAX_DAILY_FATIGUE_SCORE + 20 ? 'BLOCK' : 'WARNING',
      message: `Day ${dayNumber} 疲劳指数 ${totalFatigue.toFixed(1)}，超过建议值 ${MAX_DAILY_FATIGUE_SCORE}`,
      semanticKey: `plan_object_fatigue_day_${dayNumber}`,
      details: { dayNumber, totalFatigue, maxFatigue: MAX_DAILY_FATIGUE_SCORE },
    },
  ];
}

export function assessTransferDailyLoad(objects: PlanObject[], dayNumber: number): PlanObjectAssessment[] {
  const transferMinutes = objects
    .filter((o) => o.type === 'TRANSFER')
    .reduce((sum, o) => sum + (o.durationMinutes ?? 0), 0);
  if (transferMinutes <= MAX_DAILY_TRANSFER_MINUTES) return [];
  return [
    {
      kind: 'TRANSFER_DAILY_LOAD',
      severity: transferMinutes > MAX_DAILY_TRANSFER_MINUTES + 60 ? 'BLOCK' : 'WARNING',
      message: `Day ${dayNumber} 交通/转场合计 ${transferMinutes} 分钟，超过建议上限 ${MAX_DAILY_TRANSFER_MINUTES} 分钟`,
      semanticKey: `plan_object_transfer_load_day_${dayNumber}`,
      details: { dayNumber, transferMinutes, maxMinutes: MAX_DAILY_TRANSFER_MINUTES },
    },
  ];
}

export function assessPlanObjectDay(
  objects: PlanObject[],
  dayNumber: number,
  lunchStrategy: LunchStrategy,
): PlanObjectAssessment[] {
  return [
    ...assessStayLinkage(objects, dayNumber),
    ...assessMealWindowGap(objects, dayNumber, lunchStrategy),
    ...assessMealWindowVsArrival(objects),
    ...assessBufferLinkage(objects, dayNumber),
    ...assessDailyFatigueLoad(objects, dayNumber),
    ...assessTransferDailyLoad(objects, dayNumber),
  ];
}
