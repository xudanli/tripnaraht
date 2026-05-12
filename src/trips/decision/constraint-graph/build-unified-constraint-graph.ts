/**
 * 从 TripPlan + plan.temporal 构建 UnifiedConstraintGraphSnapshot（v1）
 */

import type { TripPlan } from '../plan-model';
import type { TimeDrift } from '../temporal/time-drift.types';
import type {
  ConstraintDomain,
  UnifiedConstraintEdge,
  UnifiedConstraintGraphSnapshot,
  UnifiedConstraintNode,
} from './unified-constraint-graph.types';
import type { ConstraintDependencyEdge } from '../temporal/constraint-edge.types';
import type { ISOTime } from '../world-model';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

/** 构建统一图时的可选域叠加（与 policies.microRepair 对齐） */
export interface BuildUnifiedConstraintGraphOptions {
  hotelCheckinLatest?: ISOTime;
}

export function slotNodeId(date: string, slotId: string): string {
  return `slot:${date}:${slotId}`;
}

export function driftNodeId(driftId: string): string {
  return `drift:${driftId}`;
}

/** 假设行程内 slot.id 唯一（常见规划器约定） */
export function findSlotDateForId(
  plan: TripPlan,
  slotId: string,
): string | undefined {
  for (const day of plan.days) {
    if (day.timeSlots.some(s => s.id === slotId)) {
      return day.date;
    }
  }
  return undefined;
}

function driftDomain(d: TimeDrift): ConstraintDomain {
  if (
    d.propagationPolicy === 'PROPAGATE_CROSS_DAY' ||
    d.cause.kind === 'CROSS_DAY_SEQUENCE_SPILLOVER'
  ) {
    return 'CROSS_DAY_SPILLOVER';
  }
  if (d.cause.kind === 'ROUTE_EXECUTION_PHYSICS') {
    return 'ROAD_NETWORK';
  }
  return 'WEATHER';
}

function topologyEdgeDomain(_e: ConstraintDependencyEdge): ConstraintDomain {
  return 'SCHEDULE_TOPOLOGY';
}

function tallyDomainCounts(
  items: ReadonlyArray<{ domain: ConstraintDomain }>,
): Partial<Record<ConstraintDomain, number>> {
  const out: Partial<Record<ConstraintDomain, number>> = {};
  for (const x of items) {
    out[x.domain] = (out[x.domain] ?? 0) + 1;
  }
  return out;
}

function appendBookingCheckinOverlay(
  plan: TripPlan,
  nodes: UnifiedConstraintNode[],
  edges: UnifiedConstraintEdge[],
  opts?: BuildUnifiedConstraintGraphOptions,
): void {
  const latest = opts?.hotelCheckinLatest;
  if (!latest) {
    return;
  }
  const latestM = parseIsoTimeToMinutes(latest);
  let k = 0;

  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      if (slot.type !== 'hotel') {
        continue;
      }
      const arr = parseIsoTimeToMinutes(slot.time);
      if (arr <= latestM) {
        continue;
      }

      const anchorId = `booking_deadline:${day.date}:${slot.id}`;
      nodes.push({
        id: anchorId,
        kind: 'BOOKING_DEADLINE_ANCHOR',
        domain: 'BOOKING',
        date: day.date,
        slotId: slot.id,
        booking: {
          latestAllowedTime: latest,
          violated: true,
          arrivalTime: slot.time,
          gapMinutes: arr - latestM,
        },
      });

      edges.push({
        id: `ulink_booking_pressure_${slot.id}_${k++}`,
        domain: 'BOOKING',
        topologyKind: 'BOOKING_CHECKIN_PRESSURE',
        fromNodeId: anchorId,
        toNodeId: slotNodeId(day.date, slot.id),
        date: day.date,
      });
    }
  }
}

export function buildUnifiedConstraintGraph(
  plan: TripPlan,
  options?: BuildUnifiedConstraintGraphOptions,
): UnifiedConstraintGraphSnapshot {
  const emittedAt = plan.temporal?.emittedAt ?? new Date().toISOString();
  const nodes: UnifiedConstraintNode[] = [];
  const edges: UnifiedConstraintEdge[] = [];

  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      nodes.push({
        id: slotNodeId(day.date, slot.id),
        kind: 'PLAN_SLOT',
        domain: 'SCHEDULE_TOPOLOGY',
        date: day.date,
        slotId: slot.id,
        activityType: slot.type,
      });
    }
  }

  const drifts = plan.temporal?.timeDrifts ?? [];
  for (const d of drifts) {
    const dom = driftDomain(d);
    nodes.push({
      id: driftNodeId(d.id),
      kind: 'TIME_DRIFT',
      domain: dom,
      date: d.date,
      slotId: d.sourceSlotId,
      drift: {
        propagationPolicy: d.propagationPolicy,
        deltaMinutes: d.deltaMinutes,
        causeKind: d.cause.kind,
      },
    });

    const sourceDate = findSlotDateForId(plan, d.sourceSlotId);
    if (sourceDate) {
      edges.push({
        id: `ulink_drift_${d.id}`,
        domain: dom,
        topologyKind: 'DRIFT_SOURCE_LINK',
        fromNodeId: slotNodeId(sourceDate, d.sourceSlotId),
        toNodeId: driftNodeId(d.id),
        date: d.date,
      });
    }
  }

  for (const ce of plan.temporal?.constraintEdges ?? []) {
    const fromDate = findSlotDateForId(plan, ce.fromSlotId);
    const toDate = findSlotDateForId(plan, ce.toSlotId);
    if (!fromDate || !toDate) {
      continue;
    }
    edges.push({
      id: `ulink_${ce.id}`,
      domain: topologyEdgeDomain(ce),
      topologyKind: ce.kind,
      fromNodeId: slotNodeId(fromDate, ce.fromSlotId),
      toNodeId: slotNodeId(toDate, ce.toSlotId),
      date: ce.date,
    });
  }

  appendBookingCheckinOverlay(plan, nodes, edges, options);

  const slotNodeCount = nodes.filter(n => n.kind === 'PLAN_SLOT').length;
  const driftNodeCount = nodes.filter(n => n.kind === 'TIME_DRIFT').length;
  const bookingDeadlineNodeCount = nodes.filter(
    n => n.kind === 'BOOKING_DEADLINE_ANCHOR',
  ).length;

  return {
    version: '1',
    emittedAt,
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      driftNodeCount,
      slotNodeCount,
      bookingDeadlineNodeCount,
      domainNodeCounts: tallyDomainCounts(nodes),
      domainEdgeCounts: tallyDomainCounts(edges),
    },
  };
}
