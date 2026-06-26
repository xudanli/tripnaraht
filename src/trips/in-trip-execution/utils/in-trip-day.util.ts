import { DateTime } from 'luxon';

export function resolveTripDayNumber(startDate: Date, endDate: Date): number {
  const start = DateTime.fromJSDate(startDate).startOf('day');
  const end = DateTime.fromJSDate(endDate).startOf('day');
  const now = DateTime.now().startOf('day');
  if (now < start) return 1;
  if (now > end) {
    return Math.max(1, Math.ceil(end.diff(start, 'days').days) + 1);
  }
  return Math.max(1, Math.floor(now.diff(start, 'days').days) + 1);
}
