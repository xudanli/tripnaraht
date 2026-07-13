/**
 * 民用晨光始 / 民用暮光终（太阳高度 −6°）—— 包装 `suncalc`（与 SunCalc `dawn`/`dusk` 一致）。
 *
 * `date`：目的地当日历日 YYYY-MM-DD；时刻输出为「UTC + utcOffsetMinutes」下的墙上 HH:mm
 * （冰岛常年 utcOffsetMinutes=0，直接用 UTC 钟面即可）。
 */

import type { ISOTime } from '../world-model';

// CommonJS 库，保持与现有 Nest/Jest 解析一致
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SunCalc = require('suncalc') as {
  getTimes: (
    date: Date,
    lat: number,
    lng: number,
    height?: number,
  ) => {
    dawn: Date;
    dusk: Date;
    sunrise: Date;
    sunset: Date;
  };
};

export interface ApproximateCivilTwilightResult {
  civilDawn: ISOTime;
  civilDusk: ISOTime;
  /** 高纬极昼/极夜等导致无效时刻 */
  ambiguous?: boolean;
}

export interface ApproximateSunriseSunsetResult {
  sunrise: ISOTime;
  sunset: ISOTime;
  ambiguous?: boolean;
}

function utcInstantToWallClockMinutes(
  d: Date,
  utcOffsetMinutes: number,
): number {
  const utcMin =
    d.getUTCHours() * 60 +
    d.getUTCMinutes() +
    d.getUTCSeconds() / 60;
  let m = utcMin + utcOffsetMinutes;
  while (m < 0) {
    m += 24 * 60;
  }
  while (m >= 24 * 60) {
    m -= 24 * 60;
  }
  return m;
}

function minutesToIsoTime(totalMinutes: number): ISOTime {
  let m = Math.round(totalMinutes);
  while (m < 0) {
    m += 24 * 60;
  }
  while (m >= 24 * 60) {
    m -= 24 * 60;
  }
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * @param utcOffsetMinutes 目的地标准时相对 UTC 的偏移（分钟，东为正）
 */
export function approximateCivilTwilightLocal(
  date: string,
  latitudeDeg: number,
  longitudeDeg: number,
  utcOffsetMinutes = 0,
): ApproximateCivilTwilightResult | null {
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) {
    return null;
  }
  const [y, mo, da] = parts;
  const utcNoon = new Date(Date.UTC(y, mo - 1, da, 12, 0, 0));
  const times = SunCalc.getTimes(utcNoon, latitudeDeg, longitudeDeg);

  const sunriseValid = isValidInstant(times.sunrise);
  const sunsetValid = isValidInstant(times.sunset);
  const dawnValid = isValidInstant(times.dawn);
  const duskValid = isValidInstant(times.dusk);

  if (!sunriseValid || !sunsetValid) {
    return {
      civilDawn: '00:00',
      civilDusk: '23:59',
      ambiguous: true,
    };
  }

  const civilDawnMinutes = dawnValid
    ? utcInstantToWallClockMinutes(times.dawn, utcOffsetMinutes)
    : utcInstantToWallClockMinutes(times.sunrise, utcOffsetMinutes);
  const civilDuskMinutes = duskValid
    ? utcInstantToWallClockMinutes(times.dusk, utcOffsetMinutes)
    : utcInstantToWallClockMinutes(times.sunset, utcOffsetMinutes);

  return {
    civilDawn: minutesToIsoTime(civilDawnMinutes),
    civilDusk: minutesToIsoTime(civilDuskMinutes),
    ambiguous: false,
  };
}

function isValidInstant(d?: Date): d is Date {
  return Boolean(d && !Number.isNaN(d.getTime()));
}

/**
 * 日出/日落墙上时钟（golden hour opportunity 等用，与 civil twilight 分开）。
 */
export function approximateSunriseSunsetLocal(
  date: string,
  latitudeDeg: number,
  longitudeDeg: number,
  utcOffsetMinutes = 0,
): ApproximateSunriseSunsetResult | null {
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) {
    return null;
  }
  const [y, mo, da] = parts;
  const utcNoon = new Date(Date.UTC(y, mo - 1, da, 12, 0, 0));
  const times = SunCalc.getTimes(utcNoon, latitudeDeg, longitudeDeg);

  if (
    !times.sunrise ||
    !times.sunset ||
    Number.isNaN(times.sunrise.getTime()) ||
    Number.isNaN(times.sunset.getTime())
  ) {
    return {
      sunrise: '00:00',
      sunset: '23:59',
      ambiguous: true,
    };
  }

  return {
    sunrise: minutesToIsoTime(
      utcInstantToWallClockMinutes(times.sunrise, utcOffsetMinutes),
    ),
    sunset: minutesToIsoTime(
      utcInstantToWallClockMinutes(times.sunset, utcOffsetMinutes),
    ),
    ambiguous: false,
  };
}
