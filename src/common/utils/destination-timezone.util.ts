/**
 * 目的地 → IANA 时区（行程墙钟）。
 * 与 RouteDirections / TripDraft 物化时写入 metadata.timezone 的口径对齐。
 */

import { DateTime } from 'luxon';

const DESTINATION_TIMEZONE_MAP: Record<string, string> = {
  IS: 'Atlantic/Reykjavik',
  GL: 'America/Godthab',
  SJ: 'Arctic/Longyearbyen',
  NO: 'Europe/Oslo',
  FI: 'Europe/Helsinki',
  SE: 'Europe/Stockholm',
  DK: 'Europe/Copenhagen',
  JP: 'Asia/Tokyo',
  CN: 'Asia/Shanghai',
  GB: 'Europe/London',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  US: 'America/New_York',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
};

/** 缺省：冰岛（历史默认展示口径） */
export const DEFAULT_DESTINATION_TIMEZONE = 'Atlantic/Reykjavik';

export function timezoneForDestination(countryCode?: string | null): string {
  const code = (countryCode || '').toUpperCase().trim();
  return DESTINATION_TIMEZONE_MAP[code] || 'UTC';
}

/**
 * 优先 trip.metadata.timezone，否则按 destination 国家码推断。
 */
export function resolveTripTimezone(input: {
  destination?: string | null;
  metadata?: unknown;
}): string {
  const meta =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : null;
  const fromMeta = typeof meta?.timezone === 'string' ? meta.timezone.trim() : '';
  if (fromMeta) return fromMeta;
  return timezoneForDestination(input.destination) || DEFAULT_DESTINATION_TIMEZONE;
}

function asDateTime(value: Date | string): DateTime | null {
  const dt =
    value instanceof Date
      ? DateTime.fromJSDate(value, { zone: 'utc' })
      : DateTime.fromISO(String(value), { setZone: true });
  return dt.isValid ? dt : null;
}

/** 绝对时刻 → 目的地 offset ISO（如 2026-08-22T09:00:00.000+08:00），避免前端从 Z 截出 01:00 */
export function toDestinationOffsetIso(
  value: Date | string | null | undefined,
  timezone: string,
): string | null {
  if (value == null) return null;
  const dt = asDateTime(value);
  if (!dt) return null;
  return dt.setZone(timezone || 'utc').toISO();
}

/** 绝对时刻 → 目的地墙钟 HH:mm */
export function toDestinationClockHm(
  value: Date | string | null | undefined,
  timezone: string,
): string | null {
  if (value == null) return null;
  const dt = asDateTime(value);
  if (!dt) return null;
  return dt.setZone(timezone || 'utc').toFormat('HH:mm');
}

/** 绝对时刻 → 目的地墙钟日期 YYYY-MM-DD（勿用设备时区拆日期） */
export function toDestinationDateLocal(
  value: Date | string | null | undefined,
  timezone: string,
): string | null {
  if (value == null) return null;
  const dt = asDateTime(value);
  if (!dt) return null;
  return dt.setZone(timezone || 'utc').toFormat('yyyy-MM-dd');
}

/**
 * 绝对时刻 → 目的地墙钟 datetime（无偏移后缀，如 2026-08-29T19:04:00）。
 * 供 DatePicker 直接绑年月日时分，避免把 ...Z 当设备时区解析。
 */
export function toDestinationWallClockIso(
  value: Date | string | null | undefined,
  timezone: string,
): string | null {
  if (value == null) return null;
  const dt = asDateTime(value);
  if (!dt) return null;
  return dt.setZone(timezone || 'utc').toFormat("yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * 时间轴 / 列表响应：保留绝对瞬间，但用目的地 offset 序列化，并附带 Local 墙钟字段。
 *
 * iOS 编辑：优先用 `timezone` + `startAtLocal`/`endAtLocal`，不要用设备时区解 `startTime` 的 Z。
 */
export function withDestinationDisplayTimes<T extends Record<string, any>>(
  item: T,
  timezone: string,
): T & {
  startTime: string | Date | null;
  endTime: string | Date | null;
  startTimeLocal: string | null;
  endTimeLocal: string | null;
  startAtLocal: string | null;
  endAtLocal: string | null;
  startDateLocal: string | null;
  endDateLocal: string | null;
  timezone: string;
} {
  const tz = timezone || 'utc';
  const startIso = toDestinationOffsetIso(item.startTime, tz);
  const endIso = toDestinationOffsetIso(item.endTime, tz);
  return {
    ...item,
    startTime: startIso ?? item.startTime ?? null,
    endTime: endIso ?? item.endTime ?? null,
    startTimeLocal: toDestinationClockHm(item.startTime, tz),
    endTimeLocal: toDestinationClockHm(item.endTime, tz),
    startAtLocal: toDestinationWallClockIso(item.startTime, tz),
    endAtLocal: toDestinationWallClockIso(item.endTime, tz),
    startDateLocal: toDestinationDateLocal(item.startTime, tz),
    endDateLocal: toDestinationDateLocal(item.endTime, tz),
    timezone: tz,
  };
}
