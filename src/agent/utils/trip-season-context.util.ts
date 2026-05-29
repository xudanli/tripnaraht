import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

/** 基于 Trip 起止推导季节表述；无日期则泛化，禁止编造具体月份。 */
export function deriveSeasonContextZh(trip?: TripPlanRequest | null): string {
  const start = trip?.date_range?.start_date ?? trip?.start_date;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return '您出行期间';
  }
  const d = new Date(`${start}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return '您出行期间';
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const period = day > 20 ? '下旬' : day > 10 ? '中旬' : '上旬';
  return `${m}月${period}`;
}
