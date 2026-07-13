/**
 * DailyDrivePlan → local schedule timeline (planning-period SDR-202 input)
 */

import type { DailyDrivePlan } from '../contracts/tep-self-drive.types';
import type { ActivityArrivalProjection } from '../validation/tep-validation.types';

const DEFAULT_DAY_START_MINUTES = 8 * 60;

export interface ScheduleActivityWindow {
  ref: string;
  startMinutesLocal: number;
  endMinutesLocal: number;
}

export interface DayScheduleTimeline {
  dayIndex: number;
  date: string;
  legFinishes: Array<{ legId: string; finishMinutesLocal: number }>;
  activities: ScheduleActivityWindow[];
  lastLegFinishMinutesLocal: number;
}

function parseIsoToLocalMinutes(iso: string, dayDate: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = new Date(`${dayDate}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) return null;
  return Math.round((d.getTime() - day.getTime()) / 60_000);
}

function arrivalMinutesForRef(
  ref: string,
  arrivals: Map<string, number>,
  fallback: number,
): number {
  const activityRef = ref.startsWith('activity_') ? ref : `activity_${ref}`;
  const accommodationRef = ref.startsWith('accommodation_')
    ? ref
    : `accommodation_${ref}`;
  return (
    arrivals.get(activityRef) ??
    arrivals.get(accommodationRef) ??
    arrivals.get(ref) ??
    fallback
  );
}

/** 构建单日时间线（与 projectScheduleArrivalsFromDailyPlans 一致的 08:00 起点） */
export function projectDayScheduleTimeline(
  day: DailyDrivePlan,
  activityArrivals?: ActivityArrivalProjection[],
): DayScheduleTimeline {
  const arrivalMap = new Map<string, number>();
  for (const row of activityArrivals ?? []) {
    const minutes = parseIsoToLocalMinutes(row.projectedArrivalAt, day.date);
    if (minutes != null) arrivalMap.set(row.activityRef, minutes);
  }

  let cursor = DEFAULT_DAY_START_MINUTES;
  const legFinishes: DayScheduleTimeline['legFinishes'] = [];

  for (const leg of day.legs) {
    const legMinutes = leg.adjustedMinutes ?? leg.baseNavigationMinutes;
    const arrivalAtLegEnd = arrivalMinutesForRef(leg.toRef, arrivalMap, cursor + legMinutes);
    cursor = arrivalAtLegEnd;
    legFinishes.push({ legId: leg.legId, finishMinutesLocal: cursor });
  }

  const activities: ScheduleActivityWindow[] = [];
  for (const activity of day.activities) {
    let start = activity.fixedStartAt
      ? (parseIsoToLocalMinutes(activity.fixedStartAt, day.date) ?? cursor)
      : (arrivalMap.get(activity.ref) ?? cursor);

    if (activity.fixedStartAt && start > cursor) {
      cursor = start;
    }

    const end = start + activity.durationMinutes + activity.bufferMinutes;
    activities.push({
      ref: activity.ref,
      startMinutesLocal: start,
      endMinutesLocal: end,
    });
    cursor = Math.max(cursor, end);
  }

  const lastLegFinishMinutesLocal =
    legFinishes.length > 0 ? legFinishes[legFinishes.length - 1]!.finishMinutesLocal : cursor;

  return {
    dayIndex: day.dayIndex,
    date: day.date,
    legFinishes,
    activities,
    lastLegFinishMinutesLocal,
  };
}

export function projectAllDayScheduleTimelines(
  dailyDrivePlans: DailyDrivePlan[],
  activityArrivals?: ActivityArrivalProjection[],
): DayScheduleTimeline[] {
  const arrivalsByDay = new Map<number, ActivityArrivalProjection[]>();
  for (const row of activityArrivals ?? []) {
    const day = dailyDrivePlans.find(
      (d) =>
        d.activities.some((a) => a.ref === row.activityRef) ||
        d.accommodation?.ref === row.activityRef ||
        d.legs.some((l) => row.activityRef.includes(l.toRef)),
    );
    if (!day) continue;
    const bucket = arrivalsByDay.get(day.dayIndex) ?? [];
    bucket.push(row);
    arrivalsByDay.set(day.dayIndex, bucket);
  }

  return dailyDrivePlans.map((day) =>
    projectDayScheduleTimeline(day, arrivalsByDay.get(day.dayIndex) ?? activityArrivals),
  );
}

export function minutesToLocalTimeLabel(totalMinutes: number): string {
  let m = Math.round(totalMinutes);
  while (m < 0) m += 24 * 60;
  while (m >= 24 * 60) m -= 24 * 60;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
