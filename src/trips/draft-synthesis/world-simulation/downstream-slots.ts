import type { AffectedSlotRef } from './impact-analysis.types';
import { PLAN_SLOT_ORDER } from './plan-slot-extraction';

function slotOrderIndex(slot: string): number {
  const i = PLAN_SLOT_ORDER.indexOf(slot as (typeof PLAN_SLOT_ORDER)[number]);
  return i >= 0 ? i : PLAN_SLOT_ORDER.length;
}

/**
 * 对每个受影响日：从该日上最早受影响时段起至当日结束；
 * 外加「最晚受影响日」之后所有全日程槽位。
 */
export function expandAffectedWithDownstream(
  affected: AffectedSlotRef[],
  totalDays: number,
): AffectedSlotRef[] {
  if (affected.length === 0) return [];

  const minSlotIdxByDay = new Map<number, number>();
  for (const a of affected) {
    const idx = slotOrderIndex(a.slot);
    const prev = minSlotIdxByDay.get(a.day);
    if (prev === undefined || idx < prev) minSlotIdxByDay.set(a.day, idx);
  }

  const seen = new Set<string>();
  const out: AffectedSlotRef[] = [];
  const push = (day: number, slot: string) => {
    const k = `${day}:${slot}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ day, slot });
  };

  const maxDay = Math.max(...affected.map((x) => x.day));

  for (const [day, minIdx] of minSlotIdxByDay) {
    for (let si = minIdx; si < PLAN_SLOT_ORDER.length; si++) {
      push(day, PLAN_SLOT_ORDER[si]);
    }
  }

  for (let d = maxDay + 1; d <= totalDays; d++) {
    for (const slot of PLAN_SLOT_ORDER) {
      push(d, slot);
    }
  }

  return out;
}
