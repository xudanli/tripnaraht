/**
 * S4 — single-day VRPTW SolverProblem from planning day items (shadow only).
 * No EDGE_FORBIDDEN / REPLACE_POOL — reuses road-close projector core with empty extras.
 */

import {
  projectRoadCloseToSolverProblem,
  type DayStopForSolver,
} from './road-close-solver-problem.projector';
import type { SolverProblem } from '../contracts/solver-problem';

export interface DayVrptwItemInput {
  itemId: string;
  label?: string;
  /** Activity start (Date or ISO) */
  startTime: Date | string;
  endTime: Date | string;
  travelFromPreviousDurationMin?: number;
  placeId?: number;
  isBooked?: boolean;
  isMandatory?: boolean;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/** Minutes from local/UTC clock of the Date (wall-clock HH*60+MM). */
export function dateToDayMinutes(v: Date | string): number {
  const d = toDate(v);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function serviceDurationMinutes(item: DayVrptwItemInput): number {
  const ms = toDate(item.endTime).getTime() - toDate(item.startTime).getTime();
  return Math.max(15, Math.round(ms / 60_000));
}

function buildDayTravelMatrix(
  visitCount: number,
  hopIn: number[],
): number[][] {
  const n = visitCount + 1; // depot
  const matrix: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0),
  );
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (i === 0) {
        matrix[i][j] = hopIn[j - 1] ?? 15 + j * 5;
        continue;
      }
      if (j === 0) {
        matrix[i][j] = hopIn[i - 1] ?? 15 + i * 5;
        continue;
      }
      if (j === i + 1) {
        matrix[i][j] = hopIn[j - 1] ?? 20;
        continue;
      }
      if (i === j + 1) {
        matrix[i][j] = hopIn[i - 1] ?? 20;
        continue;
      }
      matrix[i][j] = Math.max(12, Math.round(((hopIn[i - 1] ?? 20) + (hopIn[j - 1] ?? 20)) / 2) + 6);
    }
  }
  return matrix;
}

/**
 * Project movable day activities → SolverProblem (operation SWAP by default).
 * Returns null when fewer than 2 visits.
 */
export function buildSolverProblemFromDayItems(input: {
  requestId: string;
  tripId: string;
  planVersionId: string;
  evidenceVersionId?: string;
  snapshotId?: string;
  /** 1-based planning day index */
  dayIndex: number;
  items: DayVrptwItemInput[];
  timeLimitMs?: number;
  seed?: number;
}): SolverProblem | null {
  const items = input.items.filter((i) => i.itemId);
  if (items.length < 2) return null;

  const starts = items.map((i) => dateToDayMinutes(i.startTime));
  const dayOpen = Math.min(480, ...starts);
  const dayClose = 20 * 60;

  const depot: DayStopForSolver = {
    nodeId: 'depot',
    serviceDurationMin: 0,
    isDepot: true,
    isBooked: true,
    timeWindow: { startMin: dayOpen, endMin: dayOpen },
    fixedStartMin: dayOpen,
  };

  const visits: DayStopForSolver[] = items.map((item) => {
    const booked = Boolean(item.isBooked);
    const startMin = dateToDayMinutes(item.startTime);
    return {
      nodeId: item.itemId,
      sourceActivityId: item.itemId,
      poiId: item.placeId != null ? `place:${item.placeId}` : undefined,
      serviceDurationMin: serviceDurationMinutes(item),
      isBooked: booked,
      isMandatory: item.isMandatory ?? booked,
      canRemove: !booked,
      timeWindow: booked
        ? { startMin, endMin: startMin + 30 }
        : { startMin: dayOpen, endMin: dayClose },
      fixedStartMin: booked ? startMin : undefined,
    };
  });

  const hopIn = items.map((item, idx) => {
    if (
      typeof item.travelFromPreviousDurationMin === 'number' &&
      item.travelFromPreviousDurationMin >= 0
    ) {
      return Math.max(1, Math.round(item.travelFromPreviousDurationMin));
    }
    return 15 + idx * 3;
  });

  const stops = [depot, ...visits];
  const travelMatrixMin = buildDayTravelMatrix(visits.length, hopIn);

  return projectRoadCloseToSolverProblem({
    requestId: input.requestId,
    tripId: input.tripId,
    planVersionId: input.planVersionId,
    evidenceVersionId: input.evidenceVersionId,
    snapshotId: input.snapshotId,
    dayId: `day-${input.dayIndex}`,
    operation: 'SWAP',
    stops,
    travelMatrixMin,
    forbiddenEdges: [],
    solverConfig: {
      maxCandidates: 3,
      timeLimitMs: input.timeLimitMs ?? 1500,
      seed: input.seed ?? 42,
    },
  });
}
