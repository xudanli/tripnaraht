/**
 * Plan Mutator：将 SlotRepairPlan 应用到 TripPlan（纯函数，内存副本）
 */

import type { TripPlan, PlanSlot } from '../decision/plan-model';
import type { ISOTime } from '../decision/world-model';
import type { SlotRepairPlan } from './slot-repair.types';

function clonePlan(plan: TripPlan): TripPlan {
  return JSON.parse(JSON.stringify(plan)) as TripPlan;
}

/** HH:mm → 当天分钟 */
function timeToMinutes(t: ISOTime): number {
  const [h, m] = t.split(':').map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** 分钟 → HH:mm */
function minutesToTime(total: number): ISOTime {
  const m = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}` as ISOTime;
}

export function replacePoi(
  plan: TripPlan,
  slotId: string,
  newPoiId: string,
): void {
  for (const day of plan.days) {
    const slot = day.timeSlots.find((s) => s.id === slotId);
    if (slot) {
      slot.poiId = newPoiId;
      return;
    }
  }
}

export function shiftSlotTime(
  plan: TripPlan,
  slotId: string,
  deltaMinutes: number,
): void {
  for (const day of plan.days) {
    const slot = day.timeSlots.find((s) => s.id === slotId);
    if (slot) {
      const start = timeToMinutes(slot.time);
      slot.time = minutesToTime(start + deltaMinutes);
      if (slot.endTime) {
        const end = timeToMinutes(slot.endTime);
        slot.endTime = minutesToTime(end + deltaMinutes);
      }
      return;
    }
  }
}

export function removeSlot(plan: TripPlan, slotId: string): void {
  for (const day of plan.days) {
    day.timeSlots = day.timeSlots.filter((s) => s.id !== slotId);
  }
}

/** 在同一 PlanDay 内按 orderedSlotIds 重排（忽略未知 id） */
export function reorderSlots(plan: TripPlan, orderedSlotIds: readonly string[]): void {
  if (orderedSlotIds.length === 0) return;
  const idSet = new Set(orderedSlotIds.map(String));
  for (const day of plan.days) {
    const onDay = day.timeSlots.filter((s) => idSet.has(s.id));
    if (onDay.length === 0) continue;
    const byId = new Map(day.timeSlots.map((s) => [s.id, s] as const));
    const reordered: PlanSlot[] = [];
    for (const id of orderedSlotIds) {
      const sl = byId.get(id);
      if (sl) reordered.push(sl);
    }
    const rest = day.timeSlots.filter((s) => !idSet.has(s.id));
    day.timeSlots = [...rest, ...reordered].sort((a, b) =>
      timeToMinutes(a.time) - timeToMinutes(b.time),
    );
    return;
  }
}

/** 将 partial replan 产生的槽位快照合并回 TripPlan（纯副本） */
export function applySlotUpdates(
  plan: TripPlan,
  updates: readonly PlanSlot[],
): TripPlan {
  const newPlan = clonePlan(plan);
  const byId = new Map(updates.map((s) => [s.id, s] as const));
  for (const day of newPlan.days) {
    for (let i = 0; i < day.timeSlots.length; i++) {
      const cur = day.timeSlots[i]!;
      const u = byId.get(cur.id);
      if (u) {
        day.timeSlots[i] = u;
      }
    }
  }
  return newPlan;
}

export function applyRepair(plan: TripPlan, repairs: readonly SlotRepairPlan[]): TripPlan {
  const newPlan = clonePlan(plan);

  for (const r of repairs) {
    switch (r.action) {
      case 'NOOP':
        break;
      case 'REPLACE_POI': {
        const id = r.payload?.newPoiId;
        if (id) replacePoi(newPlan, r.slotId, id);
        break;
      }
      case 'SHIFT_TIME': {
        const d = r.payload?.deltaMinutes ?? 0;
        shiftSlotTime(newPlan, r.slotId, d);
        break;
      }
      case 'REMOVE':
        removeSlot(newPlan, r.slotId);
        break;
      case 'REORDER': {
        const ids = r.payload?.orderedSlotIds;
        if (ids?.length) reorderSlots(newPlan, ids);
        break;
      }
      default:
        break;
    }
  }

  return newPlan;
}
