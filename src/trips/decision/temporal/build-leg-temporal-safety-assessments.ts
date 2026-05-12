/**
 * P0：Leg 级抵达 vs 民用暮光 — safe arrival / overnight restructuring 输入。
 *
 * @legacy-frozen — 勿在此扩展「决策语义」；执行真相以 ExecutionOverlayFrame 为准（debug / 材料化除外）。
 */

import type { TripPlan } from '../plan-model';
import type { ActivityType } from '../world-model';
import type { LegTemporalSafetyAssessment } from './leg-temporal-safety.types';
import { approximateCivilTwilightLocal } from './approximate-civil-twilight';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

export interface LegTemporalSafetyOptions {
  latitudeDeg: number;
  longitudeDeg: number;
  utcOffsetMinutes?: number;
}

const TRANSPORT_TYPES: ReadonlySet<ActivityType> = new Set(['transport']);

function marginMinutes(arrivalM: number, duskM: number): number {
  const a = arrivalM;
  let d = duskM;
  if (d < a - 12 * 60) {
    d += 24 * 60;
  }
  return d - a;
}

function severityFromMargin(marginMin: number): LegTemporalSafetyAssessment['severity'] {
  if (marginMin >= 30) {
    return 'SAFE';
  }
  if (marginMin >= 0) {
    return 'MARGINAL';
  }
  return 'UNSAFE';
}

export function buildLegTemporalSafetyAssessments(
  plan: TripPlan,
  opt: LegTemporalSafetyOptions,
): LegTemporalSafetyAssessment[] {
  const utc = opt.utcOffsetMinutes ?? 0;
  const out: LegTemporalSafetyAssessment[] = [];

  for (const day of plan.days) {
    const tw = approximateCivilTwilightLocal(
      day.date,
      opt.latitudeDeg,
      opt.longitudeDeg,
      utc,
    );
    if (!tw || tw.ambiguous) {
      continue;
    }
    const duskM = parseIsoTimeToMinutes(tw.civilDusk);

    for (const slot of day.timeSlots) {
      const isTransport =
        TRANSPORT_TYPES.has(slot.type) || slot.travelLegFromPrev !== undefined;
      if (!isTransport) {
        continue;
      }

      const arrivalIso = slot.endTime ?? slot.time;
      const arrM = parseIsoTimeToMinutes(arrivalIso);
      const margin = marginMinutes(arrM, duskM);
      const severity = severityFromMargin(margin);
      const safeArrival = margin >= 15;

      const actions: string[] = [];
      if (!safeArrival) {
        actions.push('考虑前移抵达、缩短前段驾驶或过夜重组锚点');
      } else if (severity === 'MARGINAL') {
        actions.push('缓冲裕度偏低：留意天气延误与_SEQUENCE 漂移');
      }

      out.push({
        date: day.date,
        legId: `arrival:${slot.id}`,
        estimatedArrivalTime: arrivalIso,
        civilDuskAtDestination: tw.civilDusk,
        safeArrival,
        daylightMarginMinutes: Math.round(margin),
        severity,
        recommendedActions: actions.length ? actions : undefined,
      });
    }
  }

  return out;
}
