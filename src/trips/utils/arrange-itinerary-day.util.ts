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

export function buildDayDateTime(dayDate: Date, hhmm: string): Date {
  const [hourRaw, minuteRaw] = hhmm.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new BadRequestException(`无效时间 ${hhmm}，请使用 HH:mm`);
  }
  return DateTime.fromJSDate(dayDate, { zone: 'utc' })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate();
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
