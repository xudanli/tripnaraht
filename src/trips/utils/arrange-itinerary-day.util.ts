import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';

export function resolveTripDayByIndex<T extends { id: string; date: Date }>(
  tripDays: T[],
  dayIndex: number,
): T {
  if (tripDays.length === 0) {
    throw new BadRequestException('行程尚未创建日程天');
  }
  if (dayIndex >= 1 && dayIndex <= tripDays.length) {
    return tripDays[dayIndex - 1]!;
  }
  if (dayIndex >= 0 && dayIndex < tripDays.length) {
    return tripDays[dayIndex]!;
  }
  throw new BadRequestException(`dayIndex ${dayIndex} 超出行程天数范围 (1-${tripDays.length})`);
}

/**
 * 将「行程日 + HH:mm」转为绝对时刻。
 * @param timezone 目的地墙钟时区；中国行程应为 Asia/Shanghai。
 * 默认 utc 以保持冰岛（UTC）历史行为。
 */
export function buildDayDateTime(
  dayDate: Date,
  hhmm: string,
  timezone: string = 'utc',
): Date {
  const [hourRaw, minuteRaw] = hhmm.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new BadRequestException(`无效时间 ${hhmm}，请使用 HH:mm`);
  }
  const dayIso = DateTime.fromJSDate(dayDate, { zone: 'utc' }).toISODate();
  if (!dayIso) {
    throw new BadRequestException('无效行程日期');
  }
  const dt = DateTime.fromObject(
    {
      year: Number(dayIso.slice(0, 4)),
      month: Number(dayIso.slice(5, 7)),
      day: Number(dayIso.slice(8, 10)),
      hour,
      minute,
      second: 0,
      millisecond: 0,
    },
    { zone: timezone || 'utc' },
  );
  if (!dt.isValid) {
    throw new BadRequestException(`无法解析时间 ${hhmm}（${timezone}）`);
  }
  return dt.toJSDate();
}

/** 绝对时刻 → 目的地墙钟 HH:mm */
export function formatDayClockTime(value: Date, timezone: string = 'utc'): string {
  return DateTime.fromJSDate(value, { zone: 'utc' })
    .setZone(timezone || 'utc')
    .toFormat('HH:mm');
}

export function toZeroBasedDayIndex(dayIndex: number, dayCount: number): number {
  if (dayIndex >= 1 && dayIndex <= dayCount) return dayIndex - 1;
  if (dayIndex >= 0 && dayIndex < dayCount) return dayIndex;
  throw new BadRequestException(`dayIndex ${dayIndex} 超出行程天数范围 (1-${dayCount})`);
}

/** schedule-timeline 的 findOne 在 dev 匿名用户下应传 undefined */
export function scheduleTimelineUserId(userId: string): string | undefined {
  return userId === 'anonymous-dev-user' ? undefined : userId;
}
