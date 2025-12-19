// src/trips/decision/strategies/drdre.ts

/**
 * Dr. Dre Strategy: Constrained Scheduling
 * 
 * 目标：把一天的候选活动变成一条可执行时间轴：满足开放时间窗、移动时耗、缓冲。
 */

import {
  ActivityCandidate,
  TripWorldState,
  TravelLeg,
  GeoPoint,
} from '../world-model';
import { PlanSlot } from '../plan-model';

// helper: parse "08:30" to minutes
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const toTime = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

function isWithinOpening(
  c: ActivityCandidate,
  date: string,
  startMin: number,
  endMin: number
): boolean {
  const oh = c.openingHours?.find(x => x.date === date);
  if (!oh || oh.windows.length === 0) return true; // assume open if unknown (MVP)
  return oh.windows.some(
    w => toMin(w.start) <= startMin && endMin <= toMin(w.end)
  );
}

export interface DrDreScheduleInput {
  date: string;
  startTime: string; // day start
  endTime: string; // day end
  bufferMin: number;
  startPoint?: GeoPoint; // hotel location
}

/**
 * Dr. Dre: build a feasible ordered schedule.
 * MVP: greedy earliest-deadline + travel-time aware insertion.
 */
export async function drdreBuildDaySchedule(
  state: TripWorldState,
  input: DrDreScheduleInput,
  candidates: ActivityCandidate[],
  getTravelLeg: (
    from: GeoPoint,
    to: GeoPoint
  ) => Promise<TravelLeg>
): Promise<PlanSlot[]> {
  const dayStart = toMin(input.startTime);
  const dayEnd = toMin(input.endTime);
  const buffer = input.bufferMin;

  const remaining = candidates.slice();

  // heuristic priority: tight opening windows first, then mustSee/quality
  const priority = (c: ActivityCandidate) => {
    const must = c.mustSee ? 1 : 0;
    const q = c.qualityScore ?? 0.5;
    const inv = c.inventoryRisk ?? 1;
    return must * 10 + q * 3 + inv * 0.5;
  };

  remaining.sort((a, b) => priority(b) - priority(a));

  let cursorMin = dayStart;
  let cursorPoint = input.startPoint;

  const slots: PlanSlot[] = [];

  while (remaining.length > 0) {
    let pickedIdx = -1;
    let bestScore = -Infinity;
    let bestLeg: TravelLeg | undefined;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      if (!c.location?.point) continue;

      const leg = cursorPoint
        ? await getTravelLeg(cursorPoint, c.location.point)
        : {
            mode: state.context.travelModeDefault || 'unknown',
            from: c.location.point,
            to: c.location.point,
            durationMin: 0,
          };

      const start = cursorMin + leg.durationMin + buffer;
      const end = start + c.durationMin;

      if (end > dayEnd) continue;
      if (!isWithinOpening(c, input.date, start, end)) continue;

      // scoring: shorter travel + higher priority
      const s = priority(c) * 5 - leg.durationMin * 0.2;
      if (s > bestScore) {
        bestScore = s;
        pickedIdx = i;
        bestLeg = leg;
      }
    }

    if (pickedIdx === -1) break; // no more feasible candidates

    const c = remaining.splice(pickedIdx, 1)[0];
    const leg = bestLeg!;
    const start = cursorMin + (leg.durationMin || 0) + buffer;
    const end = start + c.durationMin;

    const slot: PlanSlot = {
      id: `slot_${input.date}_${start}`,
      time: toTime(start),
      endTime: toTime(end),
      title: c.name.zh || c.name.en || 'Activity',
      type: c.type,
      poiId: c.id,
      coordinates: c.location?.point,
      travelLegFromPrev: leg.durationMin > 0 ? leg : undefined,
      priorityTag: c.mustSee ? 'core' : 'optional',
      reasons: [
        `Scheduled by DrDre: feasible window, travel=${leg.durationMin}min`,
      ],
    };

    slots.push(slot);
    cursorMin = end;
    cursorPoint = c.location?.point;
  }

  return slots;
}

