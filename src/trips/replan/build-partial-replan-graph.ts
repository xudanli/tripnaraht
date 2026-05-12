/**
 * 由 TripPlan 构建 PartialReplanGraph：日内槽位链 + 日锚点
 */

import type { TripPlan } from '../decision/plan-model';
import type { PartialReplanGraph, ReplanNode } from './partial-replan.graph';
import { dayNodeId } from './partial-replan.graph';

function slotTimeMinutes(time: string): number {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function buildPartialReplanGraphFromPlan(plan: TripPlan): PartialReplanGraph {
  const nodes = new Map<string, ReplanNode>();

  for (const day of plan.days) {
    const dn = dayNodeId(day.date);
    if (!nodes.has(dn)) {
      nodes.set(dn, {
        id: dn,
        type: 'DAY',
        dependsOn: [],
        impactedBy: [],
        version: 1,
      });
    }

    const sorted = [...day.timeSlots].sort(
      (a, b) => slotTimeMinutes(a.time) - slotTimeMinutes(b.time),
    );

    let prevSlotId: string | undefined;
    for (const slot of sorted) {
      const dependsOn: string[] =
        prevSlotId !== undefined ? [prevSlotId] : [dn];

      nodes.set(slot.id, {
        id: slot.id,
        type: 'SLOT',
        dependsOn,
        impactedBy: [],
        version: 1,
      });

      for (const up of dependsOn) {
        const parent = nodes.get(up);
        if (parent && !parent.impactedBy.includes(slot.id)) {
          parent.impactedBy.push(slot.id);
        }
      }

      prevSlotId = slot.id;
    }
  }

  return { nodes };
}
