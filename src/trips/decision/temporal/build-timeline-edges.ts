/**
 * 由同日槽位顺序构建 TIMELINE_FOLLOW 边（传播拓扑 v0）
 */

import type { PlanDay } from '../plan-model';
import type { ConstraintDependencyEdge } from './constraint-edge.types';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

export function buildTimelineFollowEdgesForDay(day: PlanDay): ConstraintDependencyEdge[] {
  if (!day.timeSlots?.length) {
    return [];
  }
  const sorted = [...day.timeSlots].sort(
    (a, b) => parseIsoTimeToMinutes(a.time) - parseIsoTimeToMinutes(b.time),
  );
  const edges: ConstraintDependencyEdge[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    edges.push({
      id: `tl_${day.date}_${from.id}_${to.id}`,
      fromSlotId: from.id,
      toSlotId: to.id,
      date: day.date,
      kind: 'TIMELINE_FOLLOW',
    });
  }
  return edges;
}
