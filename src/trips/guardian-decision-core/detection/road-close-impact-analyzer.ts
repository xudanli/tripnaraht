/**
 * PR-B — pure impact analysis: closed road → affected segments & plan items.
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import type { EntityRef } from '../contracts/entity-ref.types';
import {
  buildItemSegmentId,
  indexSegmentsByDay,
  readSegmentItineraryItemId,
  readSegmentRoadIds,
} from './segment-plan-item.util';
import type {
  RoadSegmentBindings,
  RoadCloseImpactInput,
  RoadCloseImpactResult,
} from './road-close-impact.types';

export type { RoadCloseImpactResult } from './road-close-impact.types';

function normalizeRoadId(roadId: string): string {
  return roadId.trim().toUpperCase();
}

function segmentMatchesRoad(
  segment: { segmentId: string; metadata?: Record<string, unknown> },
  roadId: string,
  bindings?: RoadSegmentBindings,
): boolean {
  const needle = normalizeRoadId(roadId);
  const segRoads = readSegmentRoadIds(segment as any);
  if (segRoads.length > 0) {
    return segRoads.includes(needle);
  }

  const itemId = readSegmentItineraryItemId(segment as any);
  if (itemId && bindings?.byItemId?.[itemId]) {
    if (bindings.byItemId[itemId].map(normalizeRoadId).includes(needle)) {
      return true;
    }
  }
  if (bindings?.bySegmentId?.[segment.segmentId]) {
    if (
      bindings.bySegmentId[segment.segmentId].map(normalizeRoadId).includes(needle)
    ) {
      return true;
    }
  }
  return false;
}

function collectDownstreamItemsOnSameDay(
  plan: RoutePlanDraft,
  matchedSegmentIds: Set<string>,
): string[] {
  const downstream = new Set<string>();
  const byDay = indexSegmentsByDay(plan);

  for (const [, daySegments] of byDay) {
    let seenMatch = false;
    for (const seg of daySegments) {
      if (matchedSegmentIds.has(seg.segmentId)) {
        seenMatch = true;
        continue;
      }
      if (seenMatch) {
        const itemId = readSegmentItineraryItemId(seg);
        if (itemId) downstream.add(itemId);
      }
    }
  }
  return [...downstream];
}

export function analyzeRoadCloseImpact(
  plan: RoutePlanDraft,
  input: RoadCloseImpactInput,
): RoadCloseImpactResult {
  const roadId = normalizeRoadId(input.roadId);
  const matchedSegments = (plan.segments ?? []).filter((seg) => {
    if (input.primarySegmentId && seg.segmentId === input.primarySegmentId) {
      return true;
    }
    return segmentMatchesRoad(seg, roadId, input.bindings);
  });

  const matchedSegmentIds = matchedSegments.map((s) => s.segmentId);
  const matchedSet = new Set(matchedSegmentIds);

  const directItemIds = matchedSegments
    .map((s) => readSegmentItineraryItemId(s))
    .filter((id): id is string => Boolean(id));

  const downstreamItemIds = collectDownstreamItemsOnSameDay(plan, matchedSet);
  const affectedPlanItemIds = [
    ...new Set([...directItemIds, ...downstreamItemIds]),
  ];

  const affectedEntityRefs: EntityRef[] = [
    { kind: 'ROUTE_SEGMENT', id: `road:${roadId}`, label: roadId },
    ...matchedSegmentIds.map((id) => ({
      kind: 'ROUTE_SEGMENT' as const,
      id,
    })),
    ...affectedPlanItemIds.map((id) => ({
      kind: 'PLAN_ITEM' as const,
      id,
    })),
  ];

  return {
    roadId,
    matchedSegmentIds,
    affectedPlanItemIds,
    affectedEntityRefs,
    downstreamItemIds,
    matchedSegments,
  };
}

export function assertRoadCloseHasPlanItems(
  impact: RoadCloseImpactResult,
): void {
  if (impact.affectedPlanItemIds.length === 0) {
    throw new Error(
      `Road close impact for ${impact.roadId} did not resolve any PlanItem ids — data alarm only, not a travel decision`,
    );
  }
}

export function readBindingsFromTripMetadata(
  metadata: unknown,
): RoadSegmentBindings | undefined {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const block = (meta.rfc001RoadSegmentBindings ?? meta.rfc001IcelandRoadBindings) as
    | RoadSegmentBindings
    | undefined;
  return block;
}

export { buildItemSegmentId };
