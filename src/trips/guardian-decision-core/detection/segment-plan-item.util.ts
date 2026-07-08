/**
 * PR-B — segmentId ↔ itinerary item id helpers.
 */

import type { RoutePlanDraft, RouteSegment } from '../../decision/shared/world-model.types';

const ITEM_SEGMENT_RE = /-item-([^-]+)$/;

export function extractItineraryItemIdFromSegmentId(segmentId: string): string | undefined {
  const m = segmentId.match(ITEM_SEGMENT_RE);
  return m?.[1];
}

export function readSegmentItineraryItemId(segment: RouteSegment): string | undefined {
  const meta = segment.metadata as Record<string, unknown> | undefined;
  if (typeof meta?.itineraryItemId === 'string') return meta.itineraryItemId;
  return extractItineraryItemIdFromSegmentId(segment.segmentId);
}

export function readSegmentRoadIds(segment: RouteSegment): string[] {
  const meta = segment.metadata as Record<string, unknown> | undefined;
  const raw = meta?.roadIds ?? meta?.fRoadIds ?? meta?.f_road_ids;
  if (Array.isArray(raw)) {
    return raw.map((r) => String(r).toUpperCase()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return [raw.toUpperCase()];
  }
  return [];
}

export function buildItemSegmentId(tripId: string, itemId: string): string {
  return `trip-${tripId}-item-${itemId}`;
}

export function indexSegmentsByDay(
  plan: RoutePlanDraft,
): Map<number, RouteSegment[]> {
  const byDay = new Map<number, RouteSegment[]>();
  for (const seg of plan.segments ?? []) {
    const day = seg.dayIndex ?? 0;
    const list = byDay.get(day) ?? [];
    list.push(seg);
    byDay.set(day, list);
  }
  return byDay;
}
