/**
 * P5-FINAL PR-A：Overnight = ExecutionOverlayFrame 的投影。
 *
 * 仅使用三轴：**unifiedDelayMinutes**、**finalExecutionState**、**temporal.crossDayRisk**
 *（不经 LegTemporalSafety / raw drift spill / effectiveDrivableWindow 独立推断）。
 */

import type { TripPlan } from '../plan-model';
import type { ISODate } from '../world-model';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import type {
  DaylightCollapseSeverity,
  OvernightRestructuringPressure,
} from './overnight-restructuring.types';

function dateForLegId(plan: TripPlan, legId: string): ISODate | undefined {
  for (const day of plan.days) {
    if (day.timeSlots.some(s => s.id === legId)) {
      return day.date;
    }
  }
  return undefined;
}

/** 仅由 executionState + crossDayRisk 推导（不使用 daylightViolation 位）。 */
function collapseSeverity(frames: ExecutionOverlayFrame[]): DaylightCollapseSeverity {
  if (!frames.length) {
    return 'LOW';
  }
  const maxCross = Math.max(...frames.map(f => f.temporal.crossDayRisk), 0);
  if (frames.some(f => f.finalExecutionState === 'BLOCKED') || maxCross >= 0.65) {
    return 'HIGH';
  }
  if (maxCross >= 0.35 || frames.some(f => f.finalExecutionState === 'HIGH_RISK')) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * 将 overlay 真相编译为按日 overnight 压力（一日多腿聚合）。
 */
export function deriveOvernightFromOverlay(
  plan: TripPlan,
  frames: ExecutionOverlayFrame[],
): OvernightRestructuringPressure[] {
  if (!frames.length) {
    return [];
  }

  const byDate = new Map<ISODate, ExecutionOverlayFrame[]>();
  for (const day of plan.days) {
    byDate.set(day.date, []);
  }
  for (const f of frames) {
    const date = dateForLegId(plan, f.legId);
    if (!date) {
      continue;
    }
    byDate.get(date)!.push(f);
  }

  const out: OvernightRestructuringPressure[] = [];

  for (const day of plan.days) {
    const dayFrames = byDate.get(day.date) ?? [];

    const unsafeLegIds = dayFrames
      .filter(
        fr =>
          fr.finalExecutionState === 'BLOCKED' ||
          fr.finalExecutionState === 'HIGH_RISK' ||
          fr.temporal.crossDayRisk >= 0.4,
      )
      .map(fr => fr.legId);

    /** 延迟主轴：统一延误预算（读 temporal.unifiedDelayMinutes，P5-CLOSE）。 */
    const downstreamShiftMinutes = Math.round(
      dayFrames.reduce((s, fr) => s + fr.temporal.unifiedDelayMinutes, 0),
    );

    const crossDaySpillMinutes = Math.round(
      dayFrames.reduce((s, fr) => s + fr.temporal.crossDayRisk * 55, 0),
    );

    const operationalWindowViolations = 0;

    const daylightCollapseSeverity = collapseSeverity(dayFrames);

    const temporalStress = downstreamShiftMinutes + crossDaySpillMinutes;
    const restructuringRecommended =
      unsafeLegIds.length > 0 &&
      (temporalStress >= 40 || daylightCollapseSeverity === 'HIGH');

    out.push({
      date: day.date,
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
