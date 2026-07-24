/**
 * 将 WorldConstraintStore 快照叠加到 UnifiedConstraintGraph（ROAD_NETWORK / WEATHER 域节点）
 */

import type { ConstraintField } from '../../../world/constraint-field.interface';
import {
  constraintFieldsFromSnapshot,
  type WorldConstraintStoreSnapshot,
} from '../../../world/world-snapshot';
import type { TripPlan } from '../plan-model';
import { findSlotDateForId, slotNodeId } from './build-unified-constraint-graph';
import type {
  ConstraintDomain,
  UnifiedConstraintGraphSnapshot,
  UnifiedConstraintEdge,
  UnifiedConstraintNode,
} from './unified-constraint-graph.types';

function fieldToDomain(type: ConstraintField['type']): ConstraintDomain {
  if (type === 'ROAD') return 'ROAD_NETWORK';
  if (type === 'WEATHER') return 'WEATHER';
  return 'SCHEDULE_TOPOLOGY';
}

function isStressState(state: ConstraintField['state']): boolean {
  return state === 'CLOSED' || state === 'RESTRICTED' || state === 'DEGRADED';
}

/**
 * 在已有统一约束图上追加路政/天气 SSOT 节点，并连到受影响槽位（若有）。
 */
export function overlayWorldConstraintsOnUnifiedGraph(
  graph: UnifiedConstraintGraphSnapshot,
  snapshot: WorldConstraintStoreSnapshot,
  plan?: TripPlan,
): UnifiedConstraintGraphSnapshot {
  const nodes: UnifiedConstraintNode[] = [...graph.nodes];
  const edges: UnifiedConstraintEdge[] = [...graph.edges];
  const existingNodeIds = new Set(nodes.map((n) => n.id));
  let seq = 0;

  const allFields = constraintFieldsFromSnapshot(snapshot);

  for (const field of allFields) {
    if (!isStressState(field.state)) continue;

    const domain = fieldToDomain(field.type);
    const anchorId = `world_ssot:${field.type}:${field.id}`;
    if (!existingNodeIds.has(anchorId)) {
      nodes.push({
        id: anchorId,
        kind: 'BOOKING_DEADLINE_ANCHOR',
        domain,
        date: field.temporalScope?.start?.slice(0, 10),
      });
      existingNodeIds.add(anchorId);
    }

    const slotIds = field.affectedSlotIds ?? [];
    if (slotIds.length && plan) {
      for (const slotId of slotIds) {
        const date = findSlotDateForId(plan, slotId);
        if (!date) continue;
        const slotNid = slotNodeId(date, slotId);
        if (!existingNodeIds.has(slotNid)) continue;
        const edgeId = `world_overlay_${field.type}_${field.id}_${slotId}_${seq++}`;
        edges.push({
          id: edgeId,
          domain,
          topologyKind: 'BOOKING_CHECKIN_PRESSURE',
          fromNodeId: anchorId,
          toNodeId: slotNid,
          date,
        });
      }
    } else if (plan && field.type === 'WEATHER' && field.id) {
      for (const day of plan.days) {
        if (day.date !== field.id.slice(0, 10)) continue;
        for (const slot of day.timeSlots) {
          const slotNid = slotNodeId(day.date, slot.id);
          if (!existingNodeIds.has(slotNid)) continue;
          edges.push({
            id: `world_overlay_weather_${field.id}_${slot.id}_${seq++}`,
            domain: 'WEATHER',
            topologyKind: 'BOOKING_CHECKIN_PRESSURE',
            fromNodeId: anchorId,
            toNodeId: slotNid,
            date: day.date,
          });
        }
      }
    }
  }

  const driftNodeCount = nodes.filter((n) => n.kind === 'TIME_DRIFT').length;
  const slotNodeCount = nodes.filter((n) => n.kind === 'PLAN_SLOT').length;
  const bookingDeadlineNodeCount = nodes.filter(
    (n) => n.kind === 'BOOKING_DEADLINE_ANCHOR',
  ).length;

  const domainNodeCounts: Partial<Record<ConstraintDomain, number>> = {};
  const domainEdgeCounts: Partial<Record<ConstraintDomain, number>> = {};
  for (const n of nodes) {
    domainNodeCounts[n.domain] = (domainNodeCounts[n.domain] ?? 0) + 1;
  }
  for (const e of edges) {
    domainEdgeCounts[e.domain] = (domainEdgeCounts[e.domain] ?? 0) + 1;
  }

  return {
    ...graph,
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      driftNodeCount,
      slotNodeCount,
      bookingDeadlineNodeCount,
      domainNodeCounts,
      domainEdgeCounts,
    },
  };
}
