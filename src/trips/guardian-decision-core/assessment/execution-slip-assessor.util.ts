/**
 * Slice 3 E4 — pure schedule feasibility assessor (ETA vs lastEntryAt).
 */

import { DateTime } from 'luxon';
import type {
  ExecutionScheduleAssessment,
  ExecutionScheduleInput,
} from '../contracts/execution-slip.types';

export const EXECUTION_SLIP_REASON = {
  STILL_FEASIBLE: 'EXEC_SLIP_STILL_FEASIBLE',
  AT_RISK: 'EXEC_SLIP_AT_RISK',
  WINDOW_MISSED: 'EXEC_SLIP_WINDOW_MISSED',
  NO_WINDOW: 'EXEC_SLIP_NO_LAST_ENTRY',
  NOT_AT_POI: 'EXEC_SLIP_NOT_STILL_AT_POI',
} as const;

function parseIso(iso: string, timezone: string): DateTime {
  const dt = DateTime.fromISO(iso, { setZone: true });
  if (dt.isValid) return dt.setZone(timezone);
  return DateTime.fromISO(iso).setZone(timezone);
}

function combineDateAndLocalTime(
  referenceIso: string,
  localTime: string,
  timezone: string,
): DateTime {
  const ref = parseIso(referenceIso, timezone);
  const [hh, mm] = localTime.split(':').map((v) => parseInt(v, 10));
  return ref.set({ hour: hh ?? 0, minute: mm ?? 0, second: 0, millisecond: 0 });
}

export function computeSlipMinutes(
  plannedDepartAt: string,
  observedAt: string,
): number {
  const planned = DateTime.fromISO(plannedDepartAt);
  const observed = DateTime.fromISO(observedAt);
  if (!planned.isValid || !observed.isValid) return 0;
  return Math.max(0, Math.round(observed.diff(planned, 'minutes').minutes));
}

export function computeProjectedEta(input: {
  observedAt: string;
  remainingStayMinutes: number;
  travelDurationMinutes: number;
}): string {
  const base = DateTime.fromISO(input.observedAt);
  return base
    .plus({
      minutes: input.remainingStayMinutes + input.travelDurationMinutes,
    })
    .toISO()!;
}

export function assessExecutionScheduleFeasibility(
  input: ExecutionScheduleInput,
): ExecutionScheduleAssessment {
  const timezone = input.nextWindow?.timezone ?? 'UTC';
  const slipMinutes = computeSlipMinutes(
    input.observation.plannedDepartAt,
    input.observation.observedAt,
  );

  const remainingStay = input.observation.stillAtPoi
    ? input.currentActivity.remainingStayMinutes
    : 0;

  const projectedEta = computeProjectedEta({
    observedAt: input.observation.observedAt,
    remainingStayMinutes: remainingStay,
    travelDurationMinutes: input.travelDurationMinutes,
  });

  if (!input.nextWindow?.lastEntryAt) {
    return {
      result: 'UNKNOWN',
      projectedEta,
      slipMinutes,
      gate: 'NEED_CONFIRM',
      reasonCodes: [EXECUTION_SLIP_REASON.NO_WINDOW],
      infeasible: false,
    };
  }

  const lastEntryAtDt = combineDateAndLocalTime(
    input.observation.observedAt,
    input.nextWindow.lastEntryAt,
    timezone,
  );
  const projectedDt = parseIso(projectedEta, timezone);
  const lastEntryAtIso = lastEntryAtDt.toISO()!;

  if (projectedDt <= lastEntryAtDt) {
    const minutesToDeadline = Math.round(
      lastEntryAtDt.diff(projectedDt, 'minutes').minutes,
    );
    if (minutesToDeadline <= 15 && slipMinutes > 0) {
      return {
        result: 'AT_RISK',
        projectedEta,
        lastEntryAt: lastEntryAtIso,
        slipMinutes,
        gate: 'NEED_CONFIRM',
        reasonCodes: [EXECUTION_SLIP_REASON.AT_RISK],
        infeasible: false,
      };
    }
    return {
      result: 'STILL_FEASIBLE',
      projectedEta,
      lastEntryAt: lastEntryAtIso,
      slipMinutes,
      gate: 'ALLOW',
      reasonCodes: [EXECUTION_SLIP_REASON.STILL_FEASIBLE],
      infeasible: false,
    };
  }

  return {
    result: 'WINDOW_MISSED',
    projectedEta,
    lastEntryAt: lastEntryAtIso,
    slipMinutes,
    gate: 'SUGGEST_REPLACE',
    reasonCodes: [EXECUTION_SLIP_REASON.WINDOW_MISSED],
    infeasible: true,
  };
}

/** Revalidation helper — compare projected ETA against lastEntryAt after repair. */
export function isScheduleFeasibleAfterRepair(input: {
  projectedEta: string;
  lastEntryAt: string;
  timezone: string;
  referenceDateIso: string;
}): boolean {
  const lastEntryAtDt = combineDateAndLocalTime(
    input.referenceDateIso,
    input.lastEntryAt,
    input.timezone,
  );
  const projectedDt = parseIso(input.projectedEta, input.timezone);
  return projectedDt <= lastEntryAtDt;
}
