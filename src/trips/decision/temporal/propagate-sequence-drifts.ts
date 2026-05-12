/**
 * Temporal propagation v1：沿 TIMELINE_FOLLOW 顺序，将上游 PROPAGATE_SEQUENCE drift
 * 累积为下游槽位 time/endTime 平移（segment drift → downstream arrival drift 的最小闭环）。
 *
 * @deprecated 决策与解释应优先消费 ExecutionOverlayFrame.annotations.temporalProjection；
 * 本函数仅为「墙上时钟材料化」保留，不作为独立真相源。
 */

import type { TripPlan } from '../plan-model';
import { addMinutesToIsoTime, parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

const PROP_TAG = 'temporal_propagation_sequence_v1';

export interface SequencePropagationResult {
  shiftedSlotIds: string[];
}

/**
 * 读取 plan.temporal.timeDrifts，对同日、排序在漂移源之后的槽位平移时刻。
 * 漂移源槽位本身不再二次平移（天气已在 apply-weather-drive-delay 中拉长 endTime）。
 */
export function propagateSequenceDriftsToDownstreamSlots(plan: TripPlan): SequencePropagationResult {
  const drifts = plan.temporal?.timeDrifts ?? [];
  const shiftedSlotIds: string[] = [];

  for (const day of plan.days) {
    const seqDrifts = drifts.filter(
      d =>
        d.date === day.date &&
        d.propagationPolicy === 'PROPAGATE_SEQUENCE' &&
        d.deltaMinutes > 0,
    );
    if (seqDrifts.length === 0) {
      continue;
    }

    const driftDeltaBySourceId = new Map<string, number>();
    for (const d of seqDrifts) {
      driftDeltaBySourceId.set(d.sourceSlotId, d.deltaMinutes);
    }

    const sorted = [...day.timeSlots].sort(
      (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
    );

    for (let i = 0; i < sorted.length; i++) {
      let cumulative = 0;
      for (let j = 0; j < i; j++) {
        const delta = driftDeltaBySourceId.get(sorted[j].id);
        if (delta) {
          cumulative += delta;
        }
      }
      if (cumulative <= 0) {
        continue;
      }

      const slot = day.timeSlots.find(s => s.id === sorted[i].id);
      if (!slot) {
        continue;
      }
      if (slot.locked) {
        slot.reasons = [
          ...(slot.reasons ?? []),
          `[${PROP_TAG}] 上游累计延误 ${cumulative}min，本段 locked 未自动平移`,
        ];
        continue;
      }

      slot.time = addMinutesToIsoTime(slot.time, cumulative);
      if (slot.endTime) {
        slot.endTime = addMinutesToIsoTime(slot.endTime, cumulative);
      }
      shiftedSlotIds.push(slot.id);
      if (!(slot.reasons ?? []).some(r => r.includes(PROP_TAG))) {
        slot.reasons = [
          ...(slot.reasons ?? []),
          `[${PROP_TAG}] 上游驾驶延误累计 ${cumulative}min，已平移开始/结束时刻`,
        ];
      }
    }
  }

  return { shiftedSlotIds };
}
