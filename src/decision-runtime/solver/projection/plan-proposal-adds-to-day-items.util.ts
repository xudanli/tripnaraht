/**
 * Synthesize DayVrptwItemInput[] from PlanProposal ADD changes (AUTO_ARRANGE shadow).
 */

import type { PlanProposalChange } from '../../../trips/arrange-itinerary/types/plan-proposal.types';
import type { DayVrptwItemInput } from './build-solver-problem-from-day-items.util';

function parseHhMm(label: string | undefined, fallbackMin: number): number {
  if (!label || !/^\d{1,2}:\d{2}$/.test(label)) return fallbackMin;
  const [h, m] = label.split(':').map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallbackMin;
  return Math.max(0, Math.min(23 * 60 + 59, h! * 60 + m!));
}

function minutesToUtcDate(dayIso: string, minutes: number): Date {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return new Date(`${dayIso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`);
}

/** Count ADD ops per 1-based dayIndex. */
export function countAddsByDay(
  changes: PlanProposalChange[],
): Map<number, number> {
  const map = new Map<number, number>();
  for (const c of changes) {
    if (c.operation !== 'ADD') continue;
    map.set(c.dayIndex, (map.get(c.dayIndex) ?? 0) + 1);
  }
  return map;
}

/**
 * Prefer day with most ADDs.
 * @param minAdds default 2 (routing VRPTW); use 1 to still attach diagnostic shadow.
 */
export function pickDensestArrangeDay(
  changes: PlanProposalChange[],
  minAdds = 2,
): number | undefined {
  const counts = countAddsByDay(changes);
  let best: number | undefined;
  let bestN = 0;
  for (const [day, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = day;
    }
  }
  return bestN >= minAdds ? best : undefined;
}

/**
 * Build VRPTW items from ADD changes on one day.
 * itemId = candidateId ?? place:{placeId} ?? add-{i}
 */
export function planProposalAddsToDayItems(input: {
  changes: PlanProposalChange[];
  dayIndex: number;
  /** UTC calendar date for synthetic Date stamps */
  dayIso?: string;
}): DayVrptwItemInput[] {
  const dayIso = input.dayIso ?? '2026-07-20';
  const adds = input.changes.filter(
    (c) => c.operation === 'ADD' && c.dayIndex === input.dayIndex,
  );
  return adds.map((c, i) => {
    const startMin = parseHhMm(c.startTime, 9 * 60 + i * 90);
    const endMin = Math.max(startMin + 60, parseHhMm(c.endTime, startMin + 90));
    const itemId =
      c.candidateId ??
      (c.placeId != null ? `place:${c.placeId}` : `add-${input.dayIndex}-${i}`);
    return {
      itemId,
      label: c.label ?? '活动',
      startTime: minutesToUtcDate(dayIso, startMin),
      endTime: minutesToUtcDate(dayIso, endMin),
      placeId: c.placeId,
      travelFromPreviousDurationMin: i === 0 ? 15 : 20 + (i % 3) * 5,
      isBooked: false,
      isMandatory: false,
    };
  });
}
