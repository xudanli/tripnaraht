/**
 * Build SolverProblem from RoutePlanDraft + closed-road hops (evaluate bridge).
 */

import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import type { RoadCloseImpactResult } from '../../../trips/guardian-decision-core/detection/road-close-impact.types';
import type { RoadSegmentBindings } from '../../../trips/guardian-decision-core/detection/road-close-impact.types';
import type { SolverProblem } from '../contracts/solver-problem';
import { segmentNodeKey } from '../materialize/apply-day-order-to-route-plan.util';
import {
  inferForbiddenEdgesFromClosedRoad,
  projectRoadCloseToSolverProblem,
  type DayStopForSolver,
} from './road-close-solver-problem.projector';
import { suggestReplacePoolAlts } from './suggest-replace-pool-alts.util';

export function resolveAffectedDayIndex(
  plan: RoutePlanDraft,
  impact: RoadCloseImpactResult,
): number {
  for (const itemId of impact.affectedPlanItemIds) {
    const seg = plan.segments?.find(
      (s) =>
        (s.metadata as { itineraryItemId?: string })?.itineraryItemId === itemId,
    );
    if (seg) return seg.dayIndex;
  }
  const matched = plan.segments?.find((s) =>
    impact.matchedSegmentIds.includes(s.segmentId),
  );
  return matched?.dayIndex ?? 0;
}

function hopUsesClosedRoad(
  fromSeg: { metadata?: Record<string, unknown>; segmentId: string },
  toSeg: { metadata?: Record<string, unknown>; segmentId: string },
  roadId: string,
  bindings?: RoadSegmentBindings,
): boolean {
  const closed = roadId.trim().toUpperCase();
  const roadsFor = (seg: {
    metadata?: Record<string, unknown>;
    segmentId: string;
  }) => {
    const meta = seg.metadata ?? {};
    const fromMeta = Array.isArray(meta.roadIds)
      ? (meta.roadIds as unknown[]).map((r) => String(r).toUpperCase())
      : [];
    const itemId =
      typeof meta.itineraryItemId === 'string' ? meta.itineraryItemId : undefined;
    const fromBinding = itemId
      ? (bindings?.byItemId?.[itemId] ?? []).map((r) => r.toUpperCase())
      : [];
    const fromSegBinding = (bindings?.bySegmentId?.[seg.segmentId] ?? []).map((r) =>
      r.toUpperCase(),
    );
    return new Set([...fromMeta, ...fromBinding, ...fromSegBinding]);
  };
  return roadsFor(toSeg).has(closed) || roadsFor(fromSeg).has(closed);
}

/** Prefer stamped itinerary travel minutes; else distance-based heuristic. */
export function travelMinutesIntoSegment(seg: {
  distanceKm?: number;
  metadata?: Record<string, unknown>;
}): number {
  const meta = seg.metadata ?? {};
  for (const key of [
    'travelFromPreviousDurationMin',
    'travelFromPreviousDuration',
    'travelDurationMin',
  ] as const) {
    const v = meta[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      return Math.max(1, Math.round(v));
    }
  }
  return Math.max(10, Math.round((seg.distanceKm || 10) * 1.5));
}

function buildTravelMatrixMin(
  routeStops: DayStopForSolver[],
  daySegs: Array<{ distanceKm?: number; metadata?: Record<string, unknown> }>,
  alternateCount: number,
): number[][] {
  const routeN = routeStops.length; // depot + visits
  const n = routeN + alternateCount;
  const hopIn = daySegs.map((s) => travelMinutesIntoSegment(s));
  const matrix: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0),
  );

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 0;
        continue;
      }
      // Within original route (depot=0, visits=1..routeN-1)
      if (i < routeN && j < routeN) {
        if (i === 0) {
          matrix[i][j] = hopIn[j - 1] ?? 15 + j * 5;
          continue;
        }
        if (j === 0) {
          matrix[i][j] = hopIn[i - 1] ?? 15 + i * 5;
          continue;
        }
        if (j === i + 1) {
          matrix[i][j] = hopIn[j - 1] ?? 20;
          continue;
        }
        if (i === j + 1) {
          matrix[i][j] = hopIn[i - 1] ?? 20;
          continue;
        }
        const a = daySegs[i - 1];
        const b = daySegs[j - 1];
        const km = Math.abs((a?.distanceKm ?? 20) - (b?.distanceKm ?? 20)) + 18;
        matrix[i][j] = Math.max(12, Math.round(km));
        continue;
      }
      // Alternates: slightly detour-costly vs matching origin visit
      const altOrigin =
        i >= routeN ? i - routeN + 1 : j >= routeN ? j - routeN + 1 : 1;
      const base = hopIn[Math.max(0, altOrigin - 1)] ?? 25;
      matrix[i][j] = Math.max(15, base + 8);
    }
  }
  return matrix;
}

export { replaceAlternateNodeId } from './suggest-replace-pool-alts.util';

export function buildSolverProblemFromRoutePlan(input: {
  requestId: string;
  tripId: string;
  planVersionId: string;
  evidenceVersionId?: string;
  snapshotId?: string;
  plan: RoutePlanDraft;
  impact: RoadCloseImpactResult;
  bindings?: RoadSegmentBindings;
  dayIndex?: number;
  operation?: 'SWAP' | 'SHIFT';
}): SolverProblem | null {
  const dayIndex =
    input.dayIndex ?? resolveAffectedDayIndex(input.plan, input.impact);
  const daySegs = (input.plan.segments ?? [])
    .filter((s) => s.dayIndex === dayIndex)
    .slice();
  if (daySegs.length < 2) {
    return null;
  }

  const orderedKeys = daySegs.map(segmentNodeKey);
  const closedHopIndices: number[] = [];
  for (let i = 0; i < daySegs.length - 1; i++) {
    if (
      hopUsesClosedRoad(
        daySegs[i],
        daySegs[i + 1],
        input.impact.roadId,
        input.bindings,
      )
    ) {
      closedHopIndices.push(i + 1);
    }
  }
  if (!closedHopIndices.length && input.impact.affectedPlanItemIds.length) {
    closedHopIndices.push(1);
  }

  const affectedKeys = new Set(
    input.impact.affectedPlanItemIds.filter((id) => orderedKeys.includes(id)),
  );
  // Also match by poi/segment keys when impact lists itinerary ids
  for (const seg of daySegs) {
    const meta = (seg.metadata ?? {}) as Record<string, unknown>;
    const itemId =
      typeof meta.itineraryItemId === 'string' ? meta.itineraryItemId : undefined;
    if (itemId && input.impact.affectedPlanItemIds.includes(itemId)) {
      affectedKeys.add(segmentNodeKey(seg));
    }
  }

  const depot: DayStopForSolver = {
    nodeId: 'depot',
    serviceDurationMin: 0,
    isDepot: true,
    isBooked: true,
    timeWindow: { startMin: 480, endMin: 480 },
    fixedStartMin: 480,
  };

  const visitStops: DayStopForSolver[] = daySegs.map((seg) => {
    const meta = (seg.metadata ?? {}) as Record<string, unknown>;
    const key = segmentNodeKey(seg);
    const dur =
      typeof meta.serviceDurationMin === 'number'
        ? meta.serviceDurationMin
        : Math.max(30, Math.round((seg.distanceKm || 10) * 2));
    const impacted = affectedKeys.has(key);
    return {
      nodeId: key,
      sourceActivityId:
        typeof meta.itineraryItemId === 'string' ? meta.itineraryItemId : undefined,
      poiId:
        typeof meta.poiId === 'string'
          ? meta.poiId
          : typeof meta.poi_id === 'string'
            ? meta.poi_id
            : undefined,
      serviceDurationMin: dur,
      isBooked: Boolean(meta.locked ?? meta.booked),
      canRemove: impacted && !Boolean(meta.locked ?? meta.booked),
      isMandatory: !(impacted && !Boolean(meta.locked ?? meta.booked)),
      timeWindow: { startMin: 480, endMin: 1200 },
    };
  });

  const dayPoiIds = visitStops
    .map((s) => s.poiId)
    .filter((id): id is string => typeof id === 'string');
  const replacePool: Array<{ fromNodeId: string; toNodeId: string }> = [];
  const alternateStops: DayStopForSolver[] = [];
  for (const stop of visitStops) {
    if (!stop.canRemove || stop.isBooked) continue;
    const alts = suggestReplacePoolAlts({
      fromNodeId: stop.nodeId,
      poiId: stop.poiId,
      countryCode: 'IS',
      limit: 3,
      excludePoiIds: dayPoiIds,
      serviceDurationMin: stop.serviceDurationMin,
    });
    for (const alt of alts) {
      alternateStops.push({
        nodeId: alt.nodeId,
        sourceActivityId: stop.sourceActivityId
          ? `${stop.sourceActivityId}:${alt.poiId}`
          : undefined,
        poiId: alt.poiId,
        serviceDurationMin: alt.dwellMinutes ?? stop.serviceDurationMin,
        isBooked: false,
        canRemove: true,
        isMandatory: false,
        isReplaceAlternate: true,
        timeWindow: { startMin: 480, endMin: 1200 },
      });
      replacePool.push({ fromNodeId: stop.nodeId, toNodeId: alt.nodeId });
    }
  }

  const routeStops = [depot, ...visitStops];
  const stops = [...routeStops, ...alternateStops];
  const travelMatrixMin = buildTravelMatrixMin(
    routeStops,
    daySegs,
    alternateStops.length,
  );

  const orderedWithDepot = ['depot', ...orderedKeys];
  const forbiddenEdges = inferForbiddenEdgesFromClosedRoad({
    roadId: input.impact.roadId,
    orderedNodeIds: orderedWithDepot,
    closedHopIndices,
    canonicalConstraintId: `road.close.${input.impact.roadId.toUpperCase()}`,
  });

  const defaultOp = forbiddenEdges.length > 0 ? 'REROUTE' : 'SWAP';

  return projectRoadCloseToSolverProblem({
    requestId: input.requestId,
    tripId: input.tripId,
    planVersionId: input.planVersionId,
    evidenceVersionId: input.evidenceVersionId,
    snapshotId: input.snapshotId,
    dayId: `day-${dayIndex}`,
    operation: input.operation ?? defaultOp,
    stops,
    travelMatrixMin,
    forbiddenEdges,
    replacePool,
    solverConfig: { maxCandidates: 3, timeLimitMs: 2000, seed: 42 },
  });
}
