/**
 * P1：有效可驾驶窗 — civil twilight − 天气/路况惩罚（启发式 v0）。
 */

import type { ISODate, ISOTime } from '../world-model';
import type { PlanDay } from '../plan-model';
import type { ApproximateCivilTwilightResult } from './approximate-civil-twilight';
import type { EffectiveDrivableWindow } from './effective-drivable-window.types';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

function clampDayMinutes(m: number): number {
  let x = m;
  while (x < 0) {
    x += 24 * 60;
  }
  while (x >= 24 * 60) {
    x -= 24 * 60;
  }
  return x;
}

function minutesToIsoTime(totalMinutes: number): ISOTime {
  const m = Math.round(clampDayMinutes(totalMinutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function deriveWeatherRoadPenalties(day: PlanDay): {
  weatherPenaltyMinutes: number;
  roadPenaltyMinutes: number;
} {
  const wx = day.weatherExecution?.recommendedExtraDriveMinutes;
  const weatherPenaltyMinutes =
    typeof wx === 'number' ? Math.min(120, Math.max(0, Math.round(wx * 0.35))) : 0;

  const risk = day.terrainFacts?.riskFlags?.some(r => r.severity === 'HIGH');
  const roadPenaltyMinutes = risk ? 30 : 0;

  return { weatherPenaltyMinutes, roadPenaltyMinutes };
}

export function buildEffectiveDrivableWindowForDay(
  date: ISODate,
  civil: ApproximateCivilTwilightResult,
  day: PlanDay,
): EffectiveDrivableWindow | null {
  if (civil.ambiguous) {
    return null;
  }
  const dawnM = parseIsoTimeToMinutes(civil.civilDawn);
  const duskM = parseIsoTimeToMinutes(civil.civilDusk);
  const { weatherPenaltyMinutes, roadPenaltyMinutes } = deriveWeatherRoadPenalties(day);
  const total = weatherPenaltyMinutes + roadPenaltyMinutes;

  const half = Math.round(total / 2);
  let effectiveStartM = clampDayMinutes(dawnM + half);
  let effectiveEndM = clampDayMinutes(duskM - half);
  const notes: string[] = [];
  if (total > 0) {
    notes.push(
      `缩短 civil 窗：weather −${weatherPenaltyMinutes}min，road −${roadPenaltyMinutes}min（均分至两端）`,
    );
  }
  if (effectiveEndM <= effectiveStartM) {
    notes.push('惩罚后有效窗退化：需人工/引擎降级路况或改日');
    effectiveStartM = dawnM;
    effectiveEndM = duskM;
  }

  return {
    date,
    civilTwilightStart: civil.civilDawn,
    civilTwilightEnd: civil.civilDusk,
    weatherPenaltyMinutes,
    roadPenaltyMinutes,
    effectiveStart: minutesToIsoTime(effectiveStartM),
    effectiveEnd: minutesToIsoTime(effectiveEndM),
    notes: notes.length ? notes : undefined,
  };
}
