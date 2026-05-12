/**
 * 由前一日 PROPAGATE_SEQUENCE 延误合计生成跨日 TimeDrift（v1 spill）
 *
 * 策略：sum(当日 SEQUENCE drift.deltaMinutes)，封顶后映射到次日首个可滑动槽（由 propagate-cross-day 执行）。
 */

import type { TripPlan } from '../plan-model';
import type { TimeDrift } from './time-drift.types';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

/** 防止极端天气堆叠把次日整体推飞 */
const SPILL_CAP_MIN = 120;

export function emitCrossDayHandoffDrifts(plan: TripPlan): TimeDrift[] {
  const existing = plan.temporal?.timeDrifts ?? [];
  const days = [...plan.days].sort((a, b) => a.day - b.day);
  const out: TimeDrift[] = [];

  for (let i = 0; i < days.length - 1; i++) {
    const dayD = days[i];
    const dayNext = days[i + 1];
    if (!dayD.timeSlots?.length || !dayNext.timeSlots?.length) {
      continue;
    }

    const seqSum = existing
      .filter(
        d =>
          d.date === dayD.date &&
          d.propagationPolicy === 'PROPAGATE_SEQUENCE',
      )
      .reduce((s, d) => s + d.deltaMinutes, 0);

    const spill = Math.min(SPILL_CAP_MIN, seqSum);
    if (spill <= 0) {
      continue;
    }

    const sortedD = [...dayD.timeSlots].sort(
      (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
    );
    const lastSlot = sortedD[sortedD.length - 1];

    out.push({
      id: `drift_cross_${dayNext.date}_${lastSlot.id}`,
      /** 生效日：次日（传播目标日） */
      date: dayNext.date,
      sourceSlotId: lastSlot.id,
      deltaMinutes: spill,
      confidence: 0.72,
      propagationPolicy: 'PROPAGATE_CROSS_DAY',
      cause: { kind: 'CROSS_DAY_SEQUENCE_SPILLOVER' },
      narrative: `前一日(${dayD.date}) SEQUENCE 延误合计 ${seqSum}min，跨日 capped ${spill}min → 次日首段`,
    });
  }

  return out;
}
