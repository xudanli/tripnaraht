/**
 * Road repair MVP — projected ETA vs hard opening window (lastEntryAt).
 * Soft-skip when no hard window (natural / all-day POIs).
 */

import { DateTime } from 'luxon';
import {
  computeProjectedEta,
  isScheduleFeasibleAfterRepair,
} from './execution-slip-assessor.util';

export const ROAD_OPENING_WINDOW_REASON = {
  FEASIBLE: 'ROAD_OPENING_WINDOW_FEASIBLE',
  WINDOW_MISSED: 'ROAD_OPENING_WINDOW_MISSED',
  AT_RISK: 'ROAD_OPENING_WINDOW_AT_RISK',
  NO_HARD_WINDOW: 'ROAD_OPENING_WINDOW_NO_HARD_WINDOW',
} as const;

export type RoadOpeningWindowResult =
  | 'FEASIBLE'
  | 'AT_RISK'
  | 'WINDOW_MISSED'
  | 'NO_HARD_WINDOW';

export interface RoadCandidateOpeningWindow {
  lastEntryAt: string;
  closesAt?: string;
  timezone: string;
}

export interface AssessRoadCandidateOpeningWindowInput {
  /** Planned / observed arrival before this candidate's extra detour delay */
  referenceArrivalIso: string;
  /** Extra minutes from repair (Neptune estimatedAddedDurationMinutes) */
  addedDurationMinutes: number;
  window: RoadCandidateOpeningWindow | null;
  /** Minutes-to-deadline under which we emit AT_RISK instead of FEASIBLE */
  atRiskMinutes?: number;
}

export interface AssessRoadCandidateOpeningWindowResult {
  result: RoadOpeningWindowResult;
  projectedEta: string;
  lastEntryAt?: string;
  infeasible: boolean;
  reasonCodes: string[];
}

export function assessRoadCandidateOpeningWindow(
  input: AssessRoadCandidateOpeningWindowInput,
): AssessRoadCandidateOpeningWindowResult {
  const added = Math.max(0, Math.round(input.addedDurationMinutes || 0));
  const projectedEta = computeProjectedEta({
    observedAt: input.referenceArrivalIso,
    remainingStayMinutes: 0,
    travelDurationMinutes: added,
  });

  if (!input.window?.lastEntryAt) {
    return {
      result: 'NO_HARD_WINDOW',
      projectedEta,
      infeasible: false,
      reasonCodes: [ROAD_OPENING_WINDOW_REASON.NO_HARD_WINDOW],
    };
  }

  const timezone = input.window.timezone || 'UTC';
  const ok = isScheduleFeasibleAfterRepair({
    projectedEta,
    lastEntryAt: input.window.lastEntryAt,
    timezone,
    referenceDateIso: input.referenceArrivalIso,
  });

  if (!ok) {
    return {
      result: 'WINDOW_MISSED',
      projectedEta,
      lastEntryAt: input.window.lastEntryAt,
      infeasible: true,
      reasonCodes: [
        ROAD_OPENING_WINDOW_REASON.WINDOW_MISSED,
        'TIME_WINDOW_INFEASIBLE',
      ],
    };
  }

  const atRiskMinutes = input.atRiskMinutes ?? 15;
  const slack = minutesUntilLastEntry({
    projectedEta,
    lastEntryAt: input.window.lastEntryAt,
    timezone,
    referenceDateIso: input.referenceArrivalIso,
  });

  if (added > 0 && slack != null && slack <= atRiskMinutes) {
    return {
      result: 'AT_RISK',
      projectedEta,
      lastEntryAt: input.window.lastEntryAt,
      infeasible: false,
      reasonCodes: [ROAD_OPENING_WINDOW_REASON.AT_RISK],
    };
  }

  return {
    result: 'FEASIBLE',
    projectedEta,
    lastEntryAt: input.window.lastEntryAt,
    infeasible: false,
    reasonCodes: [ROAD_OPENING_WINDOW_REASON.FEASIBLE],
  };
}

function minutesUntilLastEntry(input: {
  projectedEta: string;
  lastEntryAt: string;
  timezone: string;
  referenceDateIso: string;
}): number | null {
  const ref = DateTime.fromISO(input.referenceDateIso, { setZone: true }).setZone(
    input.timezone,
  );
  if (!ref.isValid) return null;
  const [hh, mm] = input.lastEntryAt.split(':').map((v) => parseInt(v, 10));
  const deadline = ref.set({
    hour: hh ?? 0,
    minute: mm ?? 0,
    second: 0,
    millisecond: 0,
  });
  const projected = DateTime.fromISO(input.projectedEta, { setZone: true }).setZone(
    input.timezone,
  );
  if (!deadline.isValid || !projected.isValid) return null;
  return Math.round(deadline.diff(projected, 'minutes').minutes);
}
