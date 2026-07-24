/** 从 Trip 行数据推算「本次行程计划天数」 */
export function computeTripPlannedDays(trip: {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  TripDay?: unknown[];
}): number {
  const scheduledDays = trip.TripDay?.length ?? 0;
  if (scheduledDays > 0) return scheduledDays;

  if (trip.startDate && trip.endDate) {
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const diffMs = end.getTime() - start.getTime();
    if (!Number.isNaN(diffMs)) {
      return Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
    }
  }

  return 0;
}

export type DaysAlignment = 'match' | 'trip_longer' | 'trip_shorter' | 'unknown';

export function compareTripAndRouteDays(
  tripPlannedDays: number,
  routeSuggestedDays?: number | null,
): {
  daysDelta?: number;
  daysAlignment: DaysAlignment;
} {
  if (
    tripPlannedDays <= 0 ||
    routeSuggestedDays == null ||
    routeSuggestedDays <= 0
  ) {
    return { daysAlignment: 'unknown' };
  }

  const daysDelta = tripPlannedDays - routeSuggestedDays;
  if (daysDelta === 0) {
    return { daysDelta: 0, daysAlignment: 'match' };
  }
  if (daysDelta > 0) {
    return { daysDelta, daysAlignment: 'trip_longer' };
  }
  return { daysDelta, daysAlignment: 'trip_shorter' };
}
