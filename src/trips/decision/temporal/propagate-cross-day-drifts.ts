/**
 * 跨日传播 v1：将 PROPAGATE_CROSS_DAY drift 施加到「次日」首个未锁定槽位（通常为首段机动/早餐）。
 *
 * @deprecated 解释与 Neptune policy 应优先读 ExecutionOverlayFrame.temporal.crossDayRisk；
 * 本函数仅保留为墙上时钟更新。
 */

import type { TripPlan } from '../plan-model';
import {
  addMinutesToIsoTime,
  parseIsoTimeToMinutes,
} from '../utils/weather-slot-delay.util';

const TAG = 'temporal_propagation_cross_day_v1';
const RIPPLE_TAG = 'temporal_ripple_after_cross_day_v1';

export interface CrossDayPropagationResult {
  shiftedSlotIds: string[];
}

export function propagateCrossDayDriftsToNextDaySlots(
  plan: TripPlan,
): CrossDayPropagationResult {
  const shiftedSlotIds: string[] = [];
  const drifts = plan.temporal?.timeDrifts ?? [];
  const cross = drifts.filter(
    d =>
      d.propagationPolicy === 'PROPAGATE_CROSS_DAY' && d.deltaMinutes > 0,
  );

  for (const drift of cross) {
    const day = plan.days.find(d => d.date === drift.date);
    if (!day?.timeSlots?.length) {
      continue;
    }

    const sorted = [...day.timeSlots].sort(
      (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
    );

    const target = sorted.find(s => !s.locked);
    if (!target) {
      const head = sorted[0];
      const slot0 = day.timeSlots.find(s => s.id === head.id);
      if (slot0) {
        slot0.reasons = [
          ...(slot0.reasons ?? []),
          `[${TAG}] 跨日延误 ${drift.deltaMinutes}min：当日槽位均 locked，未平移`,
        ];
      }
      continue;
    }

    const slot = day.timeSlots.find(s => s.id === target.id);
    if (!slot) {
      continue;
    }

    slot.time = addMinutesToIsoTime(slot.time, drift.deltaMinutes);
    if (slot.endTime) {
      slot.endTime = addMinutesToIsoTime(slot.endTime, drift.deltaMinutes);
    }
    shiftedSlotIds.push(slot.id);
    if (!(slot.reasons ?? []).some(r => r.includes(TAG))) {
      slot.reasons = [
        ...(slot.reasons ?? []),
        `[${TAG}] 跨日延误 +${drift.deltaMinutes}min（来源前日槽 ${drift.sourceSlotId}）`,
      ];
    }

    const headIdx = sorted.findIndex(s => s.id === slot.id);
    if (headIdx >= 0) {
      for (let j = headIdx + 1; j < sorted.length; j++) {
        const tail = day.timeSlots.find(s => s.id === sorted[j].id);
        if (!tail) {
          continue;
        }
        if (tail.locked) {
          tail.reasons = [
            ...(tail.reasons ?? []),
            `[${RIPPLE_TAG}] 上游跨日 +${drift.deltaMinutes}min，本段 locked 未平移`,
          ];
          continue;
        }
        tail.time = addMinutesToIsoTime(tail.time, drift.deltaMinutes);
        if (tail.endTime) {
          tail.endTime = addMinutesToIsoTime(tail.endTime, drift.deltaMinutes);
        }
        shiftedSlotIds.push(tail.id);
        if (!(tail.reasons ?? []).some(r => r.includes(RIPPLE_TAG))) {
          tail.reasons = [
            ...(tail.reasons ?? []),
            `[${RIPPLE_TAG}] 随跨日延误整体平移 +${drift.deltaMinutes}min`,
          ];
        }
      }
    }
  }

  return { shiftedSlotIds };
}
