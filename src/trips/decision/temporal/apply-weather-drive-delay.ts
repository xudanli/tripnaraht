/**
 * 天气驾驶缓冲 → 槽位变更 + TimeDrift 发射（Temporal Propagation v0）
 *
 * 后续：由独立 Temporal Engine 读取 drifts + edges 做 downstream sweep，
 * 而非仅在原地拉长 endTime。
 */

import type { TripPlan } from '../plan-model';
import type { TimeDrift } from './time-drift.types';
import type { ConstraintDependencyEdge } from './constraint-edge.types';
import { addMinutesToIsoTime } from '../utils/weather-slot-delay.util';
import { buildTimelineFollowEdgesForDay } from './build-timeline-edges';

const TAG = 'weather_delay_padding_v1';

export interface WeatherDriveDelayResult {
  drifts: TimeDrift[];
  constraintEdges: ConstraintDependencyEdge[];
}

export function applyWeatherDriveDelayAndEmitDrifts(plan: TripPlan): WeatherDriveDelayResult {
  const drifts: TimeDrift[] = [];
  const constraintEdges: ConstraintDependencyEdge[] = [];

  for (const day of plan.days) {
    constraintEdges.push(...buildTimelineFollowEdgesForDay(day));

    const wx = day.weatherExecution;
    const df = wx?.executionQuality?.delayFactor;
    if (wx === undefined || df === undefined || df <= 1.02) {
      continue;
    }

    if (wx.executionState === 'BLOCKED') {
      wx.recommendedExtraDriveMinutes = 0;
      const head = day.timeSlots[0];
      if (head && !(head.reasons ?? []).some(r => r.includes(TAG))) {
        head.reasons = [
          ...(head.reasons ?? []),
          `[${TAG}] 当日天气证据为 BLOCKED，下列时段仅供参考，请勿依赖原定路途耗时。`,
        ];
      }
      drifts.push({
        id: `drift_blocked_${day.date}_${head?.id ?? 'day'}`,
        date: day.date,
        sourceSlotId: head?.id ?? `day_${day.day}`,
        deltaMinutes: 0,
        confidence: 0.95,
        propagationPolicy: 'NO_PROPAGATION',
        cause: {
          kind: 'WEATHER_BLOCKED_ADVISORY',
          delayFactor: df,
          executionState: wx.executionState,
        },
        narrative: 'BLOCKED：不进行下游时间推移，仅告警',
      });
      continue;
    }

    const extraTotal = Math.min(120, Math.round((df - 1) * 90));
    wx.recommendedExtraDriveMinutes = extraTotal;

    const driveSlots = day.timeSlots.filter(
      s =>
        !s.locked &&
        (s.type === 'transport' ||
          !!s.travelLegFromPrev ||
          /\b(drive|驾驶|行车|transfer)\b/i.test(s.title)),
    );
    const n = Math.max(1, driveSlots.length);
    const perSlot = Math.max(5, Math.ceil(extraTotal / n));

    let adjusted = 0;
    for (const slot of driveSlots) {
      if (!slot.endTime) {
        continue;
      }
      slot.endTime = addMinutesToIsoTime(slot.endTime, perSlot);
      adjusted += 1;
      slot.reasons = [
        ...(slot.reasons ?? []),
        `[${TAG}] 天气执行质量：本段增加 ~${perSlot}min 缓冲（delayFactor=${df.toFixed(2)}）`,
      ];
      drifts.push({
        id: `drift_wx_${day.date}_${slot.id}`,
        date: day.date,
        sourceSlotId: slot.id,
        deltaMinutes: perSlot,
        confidence: 0.78,
        propagationPolicy: 'PROPAGATE_SEQUENCE',
        cause: {
          kind: 'WEATHER_EXECUTION_QUALITY',
          delayFactor: df,
          executionState: wx.executionState,
        },
        narrative: `驾驶/转移段 endTime +${perSlot}min，建议下游 arrival 推演`,
      });
    }

    if (adjusted === 0) {
      const head = day.timeSlots[0];
      if (head && !(head.reasons ?? []).some(r => r.includes(TAG))) {
        head.reasons = [
          ...(head.reasons ?? []),
          `[${TAG}] 建议当日路程预留约 ${extraTotal}min 额外缓冲（delayFactor=${df.toFixed(2)}）`,
        ];
      }
      drifts.push({
        id: `drift_slack_${day.date}_${head?.id ?? 'day'}`,
        date: day.date,
        sourceSlotId: head?.id ?? `day_${day.day}`,
        deltaMinutes: extraTotal,
        confidence: 0.55,
        propagationPolicy: 'ACCUMULATE_GLOBAL_SLACK',
        cause: {
          kind: 'WEATHER_EXECUTION_QUALITY',
          delayFactor: df,
          executionState: wx.executionState,
        },
        narrative: '无带 endTime 的驾驶槽位：全日缓冲未绑定到具体段尾',
      });
    }
  }

  return { drifts, constraintEdges };
}
