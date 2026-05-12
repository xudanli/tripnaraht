/**
 * Golden hour — 机会域（photography utility），与 daylight feasibility 分离。
 */

import type { ISODate, ISOTime } from '../world-model';
import type { GoldenHourOpportunitySignal } from './golden-hour-opportunity.types';
import { approximateSunriseSunsetLocal } from '../temporal/approximate-civil-twilight';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

function addMinutes(iso: ISOTime, delta: number): ISOTime {
  const m = parseIsoTimeToMinutes(iso) + delta;
  let x = m;
  while (x < 0) {
    x += 24 * 60;
  }
  while (x >= 24 * 60) {
    x -= 24 * 60;
  }
  const h = Math.floor(x / 60);
  const min = x % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function buildGoldenHourOpportunitySignal(
  date: ISODate,
  latitudeDeg: number,
  longitudeDeg: number,
  utcOffsetMinutes = 0,
): GoldenHourOpportunitySignal | null {
  const sun = approximateSunriseSunsetLocal(
    date,
    latitudeDeg,
    longitudeDeg,
    utcOffsetMinutes,
  );
  if (!sun || sun.ambiguous) {
    return { date, photographyUtilityScore: 0.25 };
  }

  const morningGoldenStart = addMinutes(sun.sunrise, -50);
  const morningGoldenEnd = addMinutes(sun.sunrise, 35);
  const eveningGoldenStart = addMinutes(sun.sunset, -55);
  const eveningGoldenEnd = addMinutes(sun.sunset, 25);

  const spanMin =
    parseIsoTimeToMinutes(morningGoldenEnd) -
    parseIsoTimeToMinutes(morningGoldenStart) +
    (parseIsoTimeToMinutes(eveningGoldenEnd) - parseIsoTimeToMinutes(eveningGoldenStart));

  const photographyUtilityScore = Math.min(1, Math.max(0.15, spanMin / 280));

  return {
    date,
    morningGoldenStart,
    morningGoldenEnd,
    eveningGoldenStart,
    eveningGoldenEnd,
    photographyUtilityScore,
  };
}
