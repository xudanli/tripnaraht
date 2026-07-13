/**
 * Daylight Fact Provider — (lat, lon, localDate) → 日照事实
 * SDR-202 / 不夜驾 / runtime hooks 共用。
 */

import { DateTime } from 'luxon';
import SunCalc from 'suncalc';

export type DaylightFactSource = 'solar-algorithm' | 'sunset-fallback';

export type DaylightDegradationReason =
  | 'DAYLIGHT_DATA_MISSING'
  | 'DAYLIGHT_DATA_AMBIGUOUS';

export interface DaylightFact {
  date: string;
  lat: number;
  lng: number;
  timezone: string;
  sunriseLocal: string;
  sunsetLocal: string;
  civilDawnLocal?: string;
  civilDuskLocal?: string;
  sunriseMinutes: number;
  sunsetMinutes: number;
  civilDuskMinutes: number;
  /** sunset + maxMinutesAfterSunset（不夜驾截止） */
  drivingCutoffMinutes?: number;
  polarDay: boolean;
  polarNight: boolean;
  civilTwilightUnavailable: boolean;
  source: DaylightFactSource;
}

export interface DaylightFactFailure {
  degraded: true;
  degradationReason: DaylightDegradationReason;
  date: string;
  lat?: number;
  lng?: number;
  polarDay?: boolean;
  polarNight?: boolean;
}

export interface DailyDrivePlanGeo {
  lat: number;
  lng: number;
}

const factCache = new Map<string, DaylightFact | DaylightFactFailure>();

function isValidInstant(d?: Date): d is Date {
  return Boolean(d && !Number.isNaN(d.getTime()));
}

function localMinutesFromInstant(instant: Date, timezone: string): number {
  const zoned = DateTime.fromJSDate(instant, { zone: 'UTC' }).setZone(timezone);
  return zoned.hour * 60 + zoned.minute + Math.round(zoned.second / 60);
}

function minutesToLocalLabel(totalMinutes: number): string {
  let m = Math.round(totalMinutes);
  while (m < 0) m += 24 * 60;
  while (m >= 24 * 60) m -= 24 * 60;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function solarNoonUtc(date: string, timezone: string): Date | null {
  const dt = DateTime.fromISO(date, { zone: timezone });
  if (!dt.isValid) return null;
  return dt.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate();
}

export function clearDaylightFactCache(): void {
  factCache.clear();
}

export function resolveDaylightFact(input: {
  date: string;
  lat: number;
  lng: number;
  timezone?: string;
  maxMinutesAfterSunset?: number;
}): DaylightFact | DaylightFactFailure {
  const timezone = input.timezone ?? 'Atlantic/Reykjavik';
  const cacheKey = [
    input.date,
    input.lat.toFixed(3),
    input.lng.toFixed(3),
    timezone,
    input.maxMinutesAfterSunset ?? 0,
  ].join(':');

  const cached = factCache.get(cacheKey);
  if (cached) return cached;

  if (
    !input.date ||
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng)
  ) {
    const failure: DaylightFactFailure = {
      degraded: true,
      degradationReason: 'DAYLIGHT_DATA_MISSING',
      date: input.date,
      lat: input.lat,
      lng: input.lng,
    };
    factCache.set(cacheKey, failure);
    return failure;
  }

  const base = solarNoonUtc(input.date, timezone);
  if (!base) {
    const failure: DaylightFactFailure = {
      degraded: true,
      degradationReason: 'DAYLIGHT_DATA_MISSING',
      date: input.date,
      lat: input.lat,
      lng: input.lng,
    };
    factCache.set(cacheKey, failure);
    return failure;
  }

  const times = SunCalc.getTimes(base, input.lat, input.lng);
  const sunriseValid = isValidInstant(times.sunrise);
  const sunsetValid = isValidInstant(times.sunset);

  if (!sunriseValid || !sunsetValid) {
    const failure: DaylightFactFailure = {
      degraded: true,
      degradationReason: 'DAYLIGHT_DATA_AMBIGUOUS',
      date: input.date,
      lat: input.lat,
      lng: input.lng,
      polarNight: true,
    };
    factCache.set(cacheKey, failure);
    return failure;
  }

  const daylightHours =
    (times.sunset.getTime() - times.sunrise.getTime()) / 3_600_000;
  const polarNight = daylightHours < 4;
  const dawnValid = isValidInstant(times.dawn);
  const duskValid = isValidInstant(times.dusk);
  const civilTwilightUnavailable = !dawnValid || !duskValid;
  const polarDay = civilTwilightUnavailable && daylightHours >= 17;

  if (polarNight) {
    const failure: DaylightFactFailure = {
      degraded: true,
      degradationReason: 'DAYLIGHT_DATA_AMBIGUOUS',
      date: input.date,
      lat: input.lat,
      lng: input.lng,
      polarNight: true,
    };
    factCache.set(cacheKey, failure);
    return failure;
  }

  const sunriseMinutes = localMinutesFromInstant(times.sunrise, timezone);
  const sunsetMinutes = localMinutesFromInstant(times.sunset, timezone);
  const civilDuskMinutes = duskValid
    ? localMinutesFromInstant(times.dusk, timezone)
    : sunsetMinutes;
  const civilDawnMinutes = dawnValid
    ? localMinutesFromInstant(times.dawn, timezone)
    : sunriseMinutes;

  const fact: DaylightFact = {
    date: input.date,
    lat: input.lat,
    lng: input.lng,
    timezone,
    sunriseLocal: minutesToLocalLabel(sunriseMinutes),
    sunsetLocal: minutesToLocalLabel(sunsetMinutes),
    civilDawnLocal: minutesToLocalLabel(civilDawnMinutes),
    civilDuskLocal: minutesToLocalLabel(civilDuskMinutes),
    sunriseMinutes,
    sunsetMinutes,
    civilDuskMinutes,
    ...(input.maxMinutesAfterSunset != null
      ? { drivingCutoffMinutes: sunsetMinutes + input.maxMinutesAfterSunset }
      : {}),
    polarDay,
    polarNight: false,
    civilTwilightUnavailable,
    source: duskValid ? 'solar-algorithm' : 'sunset-fallback',
  };

  factCache.set(cacheKey, fact);
  return fact;
}

export function resolveDayGeoFromPlan(input: {
  origin: { lat?: number; lng?: number };
  destination: { lat?: number; lng?: number };
  fallbackLat: number;
  fallbackLng: number;
}): DailyDrivePlanGeo {
  const points: DailyDrivePlanGeo[] = [];
  for (const anchor of [input.origin, input.destination]) {
    if (typeof anchor.lat === 'number' && typeof anchor.lng === 'number') {
      points.push({ lat: anchor.lat, lng: anchor.lng });
    }
  }
  if (points.length) {
    return {
      lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
      lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
    };
  }
  return { lat: input.fallbackLat, lng: input.fallbackLng };
}
