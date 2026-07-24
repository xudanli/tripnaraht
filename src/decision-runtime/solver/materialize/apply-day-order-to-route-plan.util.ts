/**
 * Apply Solver day-order (platform node ids) onto a RoutePlanDraft day.
 * Does not mutate Effective Plan — returns a new draft for Shadow / Gateway only.
 */

import type { RoutePlanDraft, RouteSegment } from '../../../trips/decision/shared/world-model.types';
import type { SolverCandidate } from '../contracts/solver-response';
import { parseReplaceAlternateNodeId } from '../projection/suggest-replace-pool-alts.util';

export function segmentNodeKey(segment: RouteSegment): string {
  const meta = (segment.metadata ?? {}) as Record<string, unknown>;
  const itineraryItemId =
    typeof meta.itineraryItemId === 'string' ? meta.itineraryItemId : undefined;
  const poiId =
    typeof meta.poiId === 'string'
      ? meta.poiId
      : typeof meta.poi_id === 'string'
        ? meta.poi_id
        : undefined;
  return itineraryItemId ?? poiId ?? segment.segmentId;
}

/**
 * Reorder segments of `dayIndex` to match `orderedNodeIds` (skip depot ids not in plan).
 * Unmatched segments append in original relative order (SWAP/REROUTE soft mode).
 */
export function applyDayOrderToRoutePlan(
  base: RoutePlanDraft,
  input: {
    dayIndex: number;
    orderedNodeIds: string[];
    /** When true, drop day segments absent from orderedNodeIds (REPLACE drop) */
    strict?: boolean;
    /** Override serviceDurationMin on matching node keys */
    serviceDurationByNodeId?: Record<string, number>;
    /** Fixture / catalog poiId for alt:* nodes */
    altPoiByNodeId?: Record<string, string>;
  },
): RoutePlanDraft {
  const daySegs = (base.segments ?? []).filter((s) => s.dayIndex === input.dayIndex);
  const otherSegs = (base.segments ?? []).filter((s) => s.dayIndex !== input.dayIndex);
  if (!daySegs.length) return { ...base, segments: [...(base.segments ?? [])] };

  const byKey = new Map<string, RouteSegment>();
  for (const s of daySegs) {
    byKey.set(segmentNodeKey(s), s);
  }

  const used = new Set<string>();
  const ordered: RouteSegment[] = [];
  for (const nodeId of input.orderedNodeIds) {
    if (nodeId === 'depot') continue;
    const existing = byKey.get(nodeId);
    if (existing && !used.has(existing.segmentId)) {
      const dur = input.serviceDurationByNodeId?.[nodeId];
      ordered.push(
        dur != null
          ? {
              ...existing,
              metadata: {
                ...(existing.metadata as object),
                serviceDurationMin: dur,
                ortoolsShortened: true,
              },
            }
          : existing,
      );
      used.add(existing.segmentId);
      continue;
    }
    // Substitute alt:{from}[:i] → clone from origin visit with new poi/id
    const altParsed = parseReplaceAlternateNodeId(nodeId);
    if (altParsed) {
      const origin = byKey.get(altParsed.fromNodeId);
      if (origin) {
        const synthetic: RouteSegment = {
          ...origin,
          segmentId: `${origin.segmentId}:${nodeId}`,
          metadata: {
            ...(origin.metadata as object),
            itineraryItemId: nodeId,
            poiId:
              input.altPoiByNodeId?.[nodeId] ??
              `poi-${nodeId}`,
            ortoolsReplaceAlternate: true,
            replacesNodeId: altParsed.fromNodeId,
            replaceAltIndex: altParsed.index,
          },
        };
        ordered.push(synthetic);
        used.add(origin.segmentId); // origin dropped by replace
      }
    }
  }

  if (!input.strict) {
    for (const s of daySegs) {
      if (!used.has(s.segmentId)) ordered.push(s);
    }
  }

  return {
    ...base,
    segments: [...otherSegs, ...ordered],
  };
}

/**
 * Materialize a SolverCandidate onto RoutePlanDraft (shadow-only).
 * REPLACE: strict day membership + alt inserts; SHORTEN: duration overrides.
 */
export function applySolverCandidateToRoutePlan(
  base: RoutePlanDraft,
  candidate: SolverCandidate,
  dayIndex: number,
): RoutePlanDraft {
  const day = candidate.dayPlans[0];
  const orderedNodeIds = day?.nodeIds ?? [];
  const op = candidate.operation;
  const strict = op === 'REPLACE' || op === 'SHORTEN';
  const serviceDurationByNodeId: Record<string, number> = {};

  if (op === 'SHORTEN' && candidate.diffHint?.shiftedActivityIds?.length) {
    for (const id of candidate.diffHint.shiftedActivityIds) {
      const seg = (base.segments ?? []).find(
        (s) => s.dayIndex === dayIndex && segmentNodeKey(s) === id,
      );
      const meta = (seg?.metadata ?? {}) as Record<string, unknown>;
      const baseDur =
        typeof meta.serviceDurationMin === 'number'
          ? meta.serviceDurationMin
          : Math.max(30, Math.round((seg?.distanceKm || 10) * 2));
      serviceDurationByNodeId[id] = Math.max(10, Math.round(baseDur * 0.75));
    }
  }

  const altPoiByNodeId: Record<string, string> = {};
  const added = candidate.diffHint?.addedPoiIds ?? [];
  let addedIdx = 0;
  for (const nid of orderedNodeIds) {
    const parsed = parseReplaceAlternateNodeId(nid);
    if (!parsed) continue;
    const poi = added[parsed.index] ?? added[addedIdx++];
    if (poi) altPoiByNodeId[nid] = poi;
  }

  return applyDayOrderToRoutePlan(base, {
    dayIndex,
    orderedNodeIds,
    strict,
    serviceDurationByNodeId:
      Object.keys(serviceDurationByNodeId).length > 0
        ? serviceDurationByNodeId
        : undefined,
    altPoiByNodeId:
      Object.keys(altPoiByNodeId).length > 0 ? altPoiByNodeId : undefined,
  });
}

/** Minutes → HH:mm for TripPlan slots */
export function minutesToHhMm(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
