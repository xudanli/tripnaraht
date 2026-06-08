/**
 * 体验策划 — SunCalc 真实日照 / 黄金时刻（替代月份硬编码估算）
 */

import { DateTime } from 'luxon';
import SunCalc from 'suncalc';
import {
  approximateSunriseSunsetLocal,
} from '../../trips/decision/temporal/approximate-civil-twilight';

export const ICELAND_DEFAULT_COORDS = { lat: 64.1466, lng: -21.9426 };
const ZONE = 'Atlantic/Reykjavik';

export interface ExperienceSolarTimes {
  dateIso: string;
  lat: number;
  lng: number;
  sunrise: DateTime;
  sunset: DateTime;
  goldenHourStart: DateTime;
  goldenHourEnd: DateTime;
  civilDusk?: DateTime;
  ambiguous?: boolean;
  source: 'suncalc';
}

function icelandNoonUtcDate(isoDate: string): Date {
  const dt = DateTime.fromISO(isoDate, { zone: ZONE });
  if (!dt.isValid) {
    throw new Error(`invalid_date:${isoDate}`);
  }
  return dt.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate();
}

function wallTimeOnDate(dateIso: string, hhmm: string): DateTime {
  return DateTime.fromISO(`${dateIso}T${hhmm}`, { zone: ZONE });
}

function jsDateOnDate(dateIso: string, d: Date): DateTime {
  return DateTime.fromJSDate(d, { zone: 'UTC' }).setZone(ZONE);
}

/**
 * 由行程项坐标、走廊锚点或冰岛默认点计算当日真实日落与黄金时刻。
 */
export function resolveExperienceSolarTimes(params: {
  dateIso: string;
  lat?: number;
  lng?: number;
}): ExperienceSolarTimes {
  const lat = typeof params.lat === 'number' ? params.lat : ICELAND_DEFAULT_COORDS.lat;
  const lng = typeof params.lng === 'number' ? params.lng : ICELAND_DEFAULT_COORDS.lng;
  const dateIso = params.dateIso.slice(0, 10);

  const base = icelandNoonUtcDate(dateIso);
  const times = SunCalc.getTimes(base, lat, lng);

  const approx = approximateSunriseSunsetLocal(dateIso, lat, lng, 0);
  const ambiguous =
    approx?.ambiguous === true ||
    !times.sunset ||
    Number.isNaN(times.sunset.getTime());

  const sunset =
    ambiguous && approx?.sunset
      ? wallTimeOnDate(dateIso, approx.sunset)
      : jsDateOnDate(dateIso, times.sunset);
  const sunrise =
    ambiguous && approx?.sunrise
      ? wallTimeOnDate(dateIso, approx.sunrise)
      : jsDateOnDate(dateIso, times.sunrise);

  const goldenHourStart = times.goldenHour && !Number.isNaN(times.goldenHour.getTime())
    ? jsDateOnDate(dateIso, times.goldenHour)
    : sunset.minus({ minutes: 60 });
  const goldenHourEnd = times.goldenHourEnd && !Number.isNaN(times.goldenHourEnd.getTime())
    ? jsDateOnDate(dateIso, times.goldenHourEnd)
    : sunrise.plus({ minutes: 60 });
  const civilDusk =
    times.dusk && !Number.isNaN(times.dusk.getTime())
      ? jsDateOnDate(dateIso, times.dusk)
      : undefined;

  return {
    dateIso,
    lat,
    lng,
    sunrise,
    sunset,
    goldenHourStart,
    goldenHourEnd,
    civilDusk,
    ambiguous,
    source: 'suncalc',
  };
}

/** 从当日行程项中解析日照锚点（优先带坐标的 POI / 驾车段） */
export function resolveSolarAnchorFromItems(
  items: Array<{ type?: string; location_ref?: { coordinates?: { lat: number; lng: number } } }>,
): { lat?: number; lng?: number } {
  for (const it of items) {
    const c = it.location_ref?.coordinates;
    if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
      return { lat: c.lat, lng: c.lng };
    }
  }
  return {};
}
