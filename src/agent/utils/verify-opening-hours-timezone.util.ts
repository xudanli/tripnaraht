/**
 * VERIFY / 工作台：将 start_window 解析为目的地当地 wall-clock，而非服务器 UTC 小时。
 */

import { DateTime } from 'luxon';

/** 与 trip-draft / trips.service 对齐的可审计国家→时区表 */
export const VERIFY_COUNTRY_TIMEZONES: Record<string, string> = {
  IS: 'Atlantic/Reykjavik',
  NO: 'Europe/Oslo',
  JP: 'Asia/Tokyo',
  CN: 'Asia/Shanghai',
  US: 'America/New_York',
  NZ: 'Pacific/Auckland',
  GB: 'Europe/London',
  FR: 'Europe/Paris',
  DE: 'Europe/Berlin',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  GL: 'America/Godthab',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
  TH: 'Asia/Bangkok',
  CH: 'Europe/Zurich',
  AT: 'Europe/Vienna',
  AR: 'America/Argentina/Buenos_Aires',
  SJ: 'Arctic/Longyearbyen',
};

function normalizeCountryCode(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
}

/** 从 research_data / trip_plan_request 推断 VERIFY 用目的地 IANA 时区 */
export function resolveDestinationTimezoneForVerify(params?: {
  researchData?: Record<string, unknown> | null;
  countryCode?: string | null;
  destination?: string | null;
}): string {
  const fromResearch = normalizeCountryCode(params?.researchData?.country_code);
  if (fromResearch && VERIFY_COUNTRY_TIMEZONES[fromResearch]) {
    return VERIFY_COUNTRY_TIMEZONES[fromResearch];
  }
  const explicit = normalizeCountryCode(params?.countryCode);
  if (explicit && VERIFY_COUNTRY_TIMEZONES[explicit]) {
    return VERIFY_COUNTRY_TIMEZONES[explicit];
  }
  const dest = String(params?.destination ?? params?.researchData?.destination ?? '').trim();
  if (dest.length === 2 && VERIFY_COUNTRY_TIMEZONES[dest.toUpperCase()]) {
    return VERIFY_COUNTRY_TIMEZONES[dest.toUpperCase()];
  }
  if (dest.includes('_')) {
    const head = normalizeCountryCode(dest.split('_')[0]);
    if (VERIFY_COUNTRY_TIMEZONES[head]) return VERIFY_COUNTRY_TIMEZONES[head];
  }
  if (/冰岛|ICELAND/i.test(dest)) return VERIFY_COUNTRY_TIMEZONES.IS;
  if (/日本|JAPAN/i.test(dest)) return VERIFY_COUNTRY_TIMEZONES.JP;
  return 'UTC';
}

/**
 * 将行程项 time window 解析为目的地当地的 DateTime。
 * - HH:mm → 该日历日 destination 时区的 wall-clock
 * - ISO/Z → 绝对时刻再转 destination 时区（取当地 hour/minute 做营业窗对照）
 */
export function parseItineraryWindowInDestinationLocal(
  dayIso: string,
  timeWindow: string,
  timezone: string,
): DateTime | null {
  const day = String(dayIso ?? '').slice(0, 10);
  const tw = String(timeWindow ?? '').trim();
  if (!day || !tw) return null;

  if (tw.includes('T') || tw.includes('Z')) {
    const dt = DateTime.fromISO(tw, { setZone: true });
    return dt.isValid ? dt.setZone(timezone) : null;
  }

  const hm = tw.match(/(\d{1,2}):(\d{2})/);
  if (!hm) return null;

  const y = parseInt(day.slice(0, 4), 10);
  const mo = parseInt(day.slice(5, 7), 10);
  const d = parseInt(day.slice(8, 10), 10);
  const hour = parseInt(hm[1], 10);
  const minute = parseInt(hm[2], 10);
  const dt = DateTime.fromObject({ year: y, month: mo, day: d, hour, minute, second: 0, millisecond: 0 }, { zone: timezone });
  return dt.isValid ? dt : null;
}

/** Trip DB 的 UTC instant → 目的地当地 HH:mm（供 timeline / VERIFY 对齐） */
export function formatHmInDestinationTimezone(
  instant: Date | null | undefined,
  timezone: string,
  fallback: string,
): string {
  if (!instant) return fallback;
  const dt = DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(timezone);
  return dt.isValid ? dt.toFormat('HH:mm') : fallback;
}

export function minutesFromDestinationDayStart(
  dayIso: string,
  localDt: DateTime,
  timezone: string,
): number {
  const dayStart = DateTime.fromISO(String(dayIso).slice(0, 10), { zone: timezone }).startOf('day');
  return Math.round(localDt.diff(dayStart, 'minutes').minutes);
}
