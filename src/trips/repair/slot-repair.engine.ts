/**
 * Slot-Level Repair Engine v1：约束槽位状态 → 可执行修复意图（尚未直接写库）
 */

import type { SlotConstraintState } from '../constraints/constraint-fusion.engine';
import type { TripPlan } from '../decision/plan-model';
import type { SlotRepairPlan } from './slot-repair.types';

export type { SlotRepairAction, SlotRepairPlan } from './slot-repair.types';

function findDayAndSlot(
  plan: TripPlan,
  slotId: string,
): { dayIndex: number; slotIndex: number } | null {
  for (let d = 0; d < plan.days.length; d++) {
    const slots = plan.days[d]!.timeSlots;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]!.id === slotId) {
        return { dayIndex: d, slotIndex: i };
      }
    }
  }
  return null;
}

/** MVP：无外部 POI 目录时返回空；后续可接 readiness / 同区候选 */
export function findAlternativePOIs(plan: TripPlan, slotId: string): string[] {
  void plan;
  void slotId;
  return [];
}

/** MVP：有槽位则假定可后移固定窗口 */
export function findNextAvailableSlot(
  plan: TripPlan,
  slotId: string,
): { deltaMinutes: number } | null {
  return findDayAndSlot(plan, slotId) ? { deltaMinutes: 90 } : null;
}

export function computeSlotRepair(
  slot: SlotConstraintState,
  plan: TripPlan,
): SlotRepairPlan {
  if (!slot.isBlocked) {
    return { slotId: slot.slotId, action: 'NOOP', confidence: 1 };
  }

  const alternatives = findAlternativePOIs(plan, slot.slotId);
  if (alternatives.length > 0) {
    return {
      slotId: slot.slotId,
      action: 'REPLACE_POI',
      payload: { newPoiId: alternatives[0] },
      confidence: 0.7,
    };
  }

  const shifted = findNextAvailableSlot(plan, slot.slotId);
  if (shifted) {
    return {
      slotId: slot.slotId,
      action: 'SHIFT_TIME',
      payload: { deltaMinutes: shifted.deltaMinutes },
      confidence: 0.5,
    };
  }

  return {
    slotId: slot.slotId,
    action: 'REMOVE',
    confidence: 0.3,
  };
}

export function computeRepairsForBlockedSlots(
  fused: Map<string, SlotConstraintState>,
  plan: TripPlan,
): SlotRepairPlan[] {
  const out: SlotRepairPlan[] = [];
  for (const [, state] of fused) {
    if (state.isBlocked) {
      out.push(computeSlotRepair(state, plan));
    }
  }
  return out;
}
