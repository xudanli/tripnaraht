/**
 * 由 Physics 触发 + Temporal 应力 + 营运窗违规，合成 overnight 压力场（按日）。
 *
 * @deprecated 首选用 {@link deriveOvernightFromOverlay}（有 ExecutionOverlayFrame 时）；
 * 仅在无 corridor overlay / 测试回退时使用。
 */

import type { TripPlan } from '../plan-model';
import type { ISODate } from '../world-model';
import type { LegTemporalSafetyAssessment } from '../temporal/leg-temporal-safety.types';
import type { TimeDrift } from '../temporal/time-drift.types';
import type { OperationalDayWindowSignalSummary } from '../temporal/temporal-propagation.types';
import type { EffectiveDrivableWindow } from '../temporal/effective-drivable-window.types';
import type {
  DaylightCollapseSeverity,
  OvernightRestructuringPressure,
} from './overnight-restructuring.types';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

export interface BuildOvernightRestructuringPressureInput {
  plan: TripPlan;
  legTemporalSafetyAssessments?: LegTemporalSafetyAssessment[] | null;
  timeDrifts: TimeDrift[];
  operationalDayWindow?: OperationalDayWindowSignalSummary | null;
  effectiveDrivableWindowByDate?: Partial<Record<ISODate, EffectiveDrivableWindow>> | null;
}

function effectiveWindowMinutes(eff: EffectiveDrivableWindow): number {
  const a = parseIsoTimeToMinutes(eff.effectiveStart);
  const b = parseIsoTimeToMinutes(eff.effectiveEnd);
  let span = b - a;
  if (span < 0) {
    span += 24 * 60;
  }
  return span;
}

function severityFromEffectiveMinutes(
  minutes: number | undefined,
  unsafeCount: number,
): DaylightCollapseSeverity {
  if (minutes === undefined) {
    return unsafeCount >= 2 ? 'HIGH' : 'MEDIUM';
  }
  if (minutes < 120) {
    return 'HIGH';
  }
  if (minutes < 240) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function sumDriftsForDate(
  drifts: TimeDrift[],
  date: ISODate,
  policy: TimeDrift['propagationPolicy'],
): number {
  return drifts
    .filter(d => d.date === date && d.propagationPolicy === policy)
    .reduce((s, d) => s + Math.max(0, d.deltaMinutes), 0);
}

export function buildOvernightRestructuringPressures(
  input: BuildOvernightRestructuringPressureInput,
): OvernightRestructuringPressure[] {
  const assessments = input.legTemporalSafetyAssessments ?? [];
  const opIds = new Set(input.operationalDayWindow?.outOfWindowSlotIds ?? []);
  const out: OvernightRestructuringPressure[] = [];

  for (const day of input.plan.days) {
    const date = day.date;

    const unsafeLegIds = assessments
      .filter(a => a.date === date && a.severity === 'UNSAFE')
      .map(a => a.legId);

    const downstreamShiftMinutes = sumDriftsForDate(
      input.timeDrifts,
      date,
      'PROPAGATE_SEQUENCE',
    );
    const crossDaySpillMinutes = sumDriftsForDate(
      input.timeDrifts,
      date,
      'PROPAGATE_CROSS_DAY',
    );

    let operationalWindowViolations = 0;
    for (const slot of day.timeSlots) {
      if (opIds.has(slot.id)) {
        operationalWindowViolations++;
      }
    }

    const eff = input.effectiveDrivableWindowByDate?.[date];
    const effMin = eff ? effectiveWindowMinutes(eff) : undefined;
    const daylightCollapseSeverity = severityFromEffectiveMinutes(
      effMin,
      unsafeLegIds.length,
    );

    const temporalStress =
      downstreamShiftMinutes + crossDaySpillMinutes;
    const restructuringRecommended =
      unsafeLegIds.length > 0 &&
      (temporalStress >= 40 ||
        operationalWindowViolations >= 1 ||
        daylightCollapseSeverity === 'HIGH');

    out.push({
      date,
      unsafeLegIds,
      downstreamShiftMinutes,
      crossDaySpillMinutes,
      operationalWindowViolations,
      daylightCollapseSeverity,
      restructuringRecommended,
    });
  }

  return out;
}
