/**
 * 多日计划：前一日时间轴末槽 → 次日时间轴首槽（跨日拓扑边）
 */

import type { TripPlan } from '../plan-model';
import type { ConstraintDependencyEdge } from './constraint-edge.types';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

export function buildCrossDayHandoffEdges(plan: TripPlan): ConstraintDependencyEdge[] {
  const edges: ConstraintDependencyEdge[] = [];
  const days = [...plan.days].sort((a, b) => a.day - b.day);

  for (let i = 0; i < days.length - 1; i++) {
    const dayD = days[i];
    const dayNext = days[i + 1];
    if (!dayD.timeSlots?.length || !dayNext.timeSlots?.length) {
      continue;
    }

    const sortedD = [...dayD.timeSlots].sort(
      (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
    );
    const sortedNext = [...dayNext.timeSlots].sort(
      (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
    );

    const from = sortedD[sortedD.length - 1];
    const to = sortedNext[0];

    edges.push({
      id: `cdh_${dayD.date}_${dayNext.date}_${from.id}_${to.id}`,
      fromSlotId: from.id,
      toSlotId: to.id,
      date: dayNext.date,
      kind: 'CROSS_DAY_HANDOFF',
    });
  }

  return edges;
}
