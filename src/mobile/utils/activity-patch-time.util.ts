import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

/** 接受 HH:mm（相对 TripDay.date）或 ISO8601 */
export function resolvePatchDateTime(
  dayDate: Date,
  value: string,
  fallback?: Date | null,
): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return fallback ?? null;
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hourRaw, minuteRaw] = trimmed.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      throw new BadRequestException(`无效时间 ${value}，请使用 HH:mm 或 ISO8601`);
    }
    return DateTime.fromJSDate(dayDate, { zone: 'utc' })
      .set({ hour, minute, second: 0, millisecond: 0 })
      .toJSDate();
  }
  const parsed = DateTime.fromISO(trimmed);
  if (parsed.isValid) return parsed.toJSDate();
  const asDate = new Date(trimmed);
  if (!Number.isNaN(asDate.getTime())) return asDate;
  throw new BadRequestException(`无效时间 ${value}，请使用 HH:mm 或 ISO8601`);
}
