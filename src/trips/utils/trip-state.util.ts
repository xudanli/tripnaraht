import { DateTime } from 'luxon';
import { TripStatus } from '../dto/trip-status.dto';
import { resolveTripDayNumber } from '../in-trip-execution/utils/in-trip-day.util';

export type TripStateDayRow = {
  id: string;
  date: Date;
  ItineraryItem: Array<{
    id: string;
    placeId: number | null;
    startTime: Date | null;
    endTime: Date | null;
  }>;
};

export function resolveTripStateDayContext(input: {
  tripDays: TripStateDayRow[];
  startDate: Date;
  endDate: Date;
  now: DateTime;
  tripStatus: TripStatus;
}): { day: TripStateDayRow | null; effectiveNow: DateTime } {
  const { tripDays, startDate, endDate, now, tripStatus } = input;
  if (tripDays.length === 0) {
    return { day: null, effectiveNow: now };
  }

  const calendarDay = tripDays.find((d) => DateTime.fromJSDate(d.date).hasSame(now, 'day'));
  if (calendarDay) {
    return { day: calendarDay, effectiveNow: now };
  }

  if (tripStatus !== TripStatus.TRAVELING) {
    return { day: null, effectiveNow: now };
  }

  const dayNumber = resolveTripDayNumber(startDate, endDate);
  const day = tripDays[Math.min(Math.max(0, dayNumber - 1), tripDays.length - 1)] ?? null;
  if (!day) {
    return { day: null, effectiveNow: now };
  }

  const dayStart = DateTime.fromJSDate(day.date).startOf('day');
  const firstTimed = day.ItineraryItem.find((i) => i.startTime);
  const effectiveNow = firstTimed?.startTime
    ? DateTime.fromJSDate(firstTimed.startTime)
    : dayStart.plus({ hours: 9 });

  return { day, effectiveNow };
}

export function pickNextItineraryItemForStop(
  items: TripStateDayRow['ItineraryItem'],
  now: DateTime,
  currentItemId: string | null,
): TripStateDayRow['ItineraryItem'][number] | null {
  const sorted = [...items].sort(
    (a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0),
  );

  if (currentItemId) {
    const idx = sorted.findIndex((i) => i.id === currentItemId);
    if (idx >= 0) {
      const after = sorted.slice(idx + 1).find((i) => i.placeId != null && i.startTime);
      if (after) return after;
    }
  }

  for (const item of sorted) {
    if (!item.startTime || !item.endTime || item.placeId == null) continue;
    const start = DateTime.fromJSDate(item.startTime);
    const end = DateTime.fromJSDate(item.endTime);
    if (now >= start && now <= end) continue;
    if (now < start) return item;
  }

  return sorted.find((i) => i.placeId != null && i.startTime) ?? null;
}

export function resolveCurrentItemId(
  items: TripStateDayRow['ItineraryItem'],
  now: DateTime,
): string | null {
  for (const item of items) {
    if (!item.startTime || !item.endTime) continue;
    const start = DateTime.fromJSDate(item.startTime);
    const end = DateTime.fromJSDate(item.endTime);
    if (now >= start && now <= end) return item.id;
  }
  return null;
}
