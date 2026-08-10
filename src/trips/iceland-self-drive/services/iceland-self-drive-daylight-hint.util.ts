import { DateTime } from 'luxon';
import { resolveDaylightFact } from '../../tep/utils/daylight-fact.provider';
import {
  ICELAND_DAYLIGHT_FALLBACK_LAT,
  ICELAND_DAYLIGHT_FALLBACK_LNG,
  ICELAND_DAYLIGHT_TIMEZONE,
} from '../../../decision-runtime/packs/knowledge/demo/enrich-iceland-route-facts-daylight';
import { countInclusiveDays } from '../dictionaries/iceland-self-drive.dictionaries';

export interface IcelandSelfDriveDaylightHint {
  dayCount: number;
  nightCount: number;
  seasonLabel: string;
  daylightLabel: string;
  daylightHoursMin: number;
  daylightHoursMax: number;
}

const SEASON_BY_MONTH: Record<number, string> = {
  1: '冬季旅行（1月）',
  2: '冬季旅行（2月）',
  3: '冬春过渡（3月）',
  4: '春季旅行（4月）',
  5: '春夏过渡（5月）',
  6: '夏季旅行（6月）',
  7: '夏季旅行（7月）',
  8: '夏季旅行（8月）',
  9: '秋季旅行（9月）',
  10: '秋冬过渡（10月）',
  11: '冬季旅行（11月）',
  12: '冬季旅行（12月）',
};

/**
 * Approximate usable daylight hours for Reykjavík across the trip date range.
 * Uses SunCalc civil twilight when available; falls back to month climatology.
 */
export function computeDaylightHint(
  startDate: string,
  endDate: string,
): IcelandSelfDriveDaylightHint {
  const dayCount = countInclusiveDays(startDate, endDate);
  if (dayCount <= 0) {
    throw new Error('INVALID_DATE_RANGE');
  }

  const nightCount = Math.max(0, dayCount - 1);
  const start = DateTime.fromISO(startDate, { zone: 'utc' });
  const month = start.isValid ? start.month : 2;
  const seasonLabel = SEASON_BY_MONTH[month] ?? `旅行（${month}月）`;

  const hours: number[] = [];
  for (let i = 0; i < dayCount; i++) {
    const date = start.plus({ days: i }).toISODate();
    if (!date) continue;
    hours.push(daylightHoursForDate(date));
  }

  const daylightHoursMin = Math.max(0, Math.floor(Math.min(...hours)));
  const daylightHoursMax = Math.max(
    daylightHoursMin,
    Math.ceil(Math.max(...hours)),
  );

  return {
    dayCount,
    nightCount,
    seasonLabel,
    daylightLabel: `预计每日可用日照约 ${daylightHoursMin}-${daylightHoursMax} 小时`,
    daylightHoursMin,
    daylightHoursMax,
  };
}

function daylightHoursForDate(date: string): number {
  const fact = resolveDaylightFact({
    date,
    lat: ICELAND_DAYLIGHT_FALLBACK_LAT,
    lng: ICELAND_DAYLIGHT_FALLBACK_LNG,
    timezone: ICELAND_DAYLIGHT_TIMEZONE,
  });

  if (!('degraded' in fact)) {
    if (fact.polarDay) return 24;
    if (fact.polarNight) return 0;
    const span = fact.civilDuskMinutes - (fact.sunriseMinutes - 30);
    // civil dawn ≈ sunrise-30 fallback when civilDawn absent
    const dawn = fact.civilDawnLocal
      ? parseLocalLabelToMinutes(fact.civilDawnLocal)
      : fact.sunriseMinutes - 30;
    const dusk = fact.civilDuskMinutes;
    if (dawn != null && Number.isFinite(dusk)) {
      let minutes = dusk - dawn;
      if (minutes < 0) minutes += 24 * 60;
      return minutes / 60;
    }
    if (Number.isFinite(span) && span > 0) return span / 60;
  }

  return climatologyHours(DateTime.fromISO(date, { zone: 'utc' }).month);
}

function parseLocalLabelToMinutes(label?: string): number | undefined {
  if (!label || !/^\d{1,2}:\d{2}$/.test(label)) return undefined;
  const [h, m] = label.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
  return h * 60 + m;
}

/** Rough Reykjavík daylight hours by month when SunCalc degrades */
function climatologyHours(month: number): number {
  const table: Record<number, number> = {
    1: 5,
    2: 7.5,
    3: 11,
    4: 14.5,
    5: 18,
    6: 21,
    7: 20,
    8: 16.5,
    9: 13,
    10: 9.5,
    11: 6.5,
    12: 4.5,
  };
  return table[month] ?? 10;
}
