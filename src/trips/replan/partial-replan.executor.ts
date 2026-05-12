/**
 * Partial Replan Executor：仅在 subgraph 上重算槽位（MVP）
 */

import type { PlanDay, PlanSlot, TripPlan } from '../decision/plan-model';
import type { ISOTime } from '../decision/world-model';
import type { Subgraph } from './impact-subgraph.extractor';
import type { ReplanNode } from './partial-replan.graph';

export interface PlanDiff {
  readonly changedSlotIds: readonly string[];
  readonly touchedDayDates: readonly string[];
}

export interface PartialReplanResult {
  readonly updatedSlots: readonly PlanSlot[];
  readonly affectedDays: readonly PlanDay[];
  readonly diff: PlanDiff;
}

export function findSlotInPlan(
  plan: TripPlan,
  slotId: string,
): { day: PlanDay; slot: PlanSlot; dayIndex: number; slotIndex: number } | undefined {
  for (let d = 0; d < plan.days.length; d++) {
    const day = plan.days[d]!;
    for (let i = 0; i < day.timeSlots.length; i++) {
      const slot = day.timeSlots[i]!;
      if (slot.id === slotId) {
        return { day, slot, dayIndex: d, slotIndex: i };
      }
    }
  }
  return undefined;
}

/**
 * MVP：轻量重算（时间缓冲 / 审计标记）；后续可换 ETA/OSRM。
 */
export function recomputeSlot(
  slot: PlanSlot,
  plan: TripPlan,
  node: ReplanNode,
): PlanSlot {
  void plan;
  const bump = (t: ISOTime, deltaMin: number): ISOTime => {
    const [h, m] = t.split(':').map((x) => parseInt(x, 10));
    const total = ((Number.isFinite(h) ? h : 0) * 60 +
      (Number.isFinite(m) ? m : 0) +
      deltaMin) %
      (24 * 60);
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` as ISOTime;
  };

  const delta =
    slot.reasons?.some((r) => r.includes('partial_replan')) ? 0 : 30;

  return {
    ...slot,
    time: delta === 0 ? slot.time : bump(slot.time, delta),
    reasons: [
      ...(slot.reasons ?? []),
      `partial_replan_v${node.version}_${Date.now()}`,
    ],
  };
}

function buildDiff(
  plan: TripPlan,
  updated: readonly PlanSlot[],
): PlanDiff {
  const changedSlotIds = updated.map((s) => s.id);
  const touched = new Set<string>();
  for (const sid of changedSlotIds) {
    const loc = findSlotInPlan(plan, sid);
    if (loc) touched.add(loc.day.date);
  }
  return {
    changedSlotIds,
    touchedDayDates: [...touched].sort(),
  };
}

export function executePartialReplan(
  subgraph: Subgraph,
  plan: TripPlan,
): PartialReplanResult {
  const updatedSlots: PlanSlot[] = [];
  const slotNodes = subgraph.nodes.filter((n) => n.type === 'SLOT');

  for (const node of slotNodes) {
    const loc = findSlotInPlan(plan, node.id);
    if (!loc) continue;
    const next = recomputeSlot(loc.slot, plan, node);
    updatedSlots.push(next);
  }

  const affectedDays: PlanDay[] = [];
  const seen = new Set<string>();
  for (const s of updatedSlots) {
    const loc = findSlotInPlan(plan, s.id);
    if (loc && !seen.has(loc.day.date)) {
      seen.add(loc.day.date);
      affectedDays.push(loc.day);
    }
  }

  return {
    updatedSlots,
    affectedDays,
    diff: buildDiff(plan, updatedSlots),
  };
}
