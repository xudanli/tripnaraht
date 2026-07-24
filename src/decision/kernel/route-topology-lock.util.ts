/**
 * OPTIMIZE 落盘：路由拓扑骨架锁（freezeRouteSelection 生产闭环）
 */

import type { Itinerary, ItineraryDay, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import { itineraryToRoutePlanDraft } from './dso-to-trips-converter';
import { routeSkeletonSignature } from '../../trips/decision/optimization/cgus-route-skeleton.util';
import type { RoutePlanDraft } from '../../trips/decision/shared/world-model.types';

export interface RouteTopologyLockRecord {
  route_skeleton_locked: boolean;
  lockedSegmentIds: string[];
  routeSkeletonSignature: string;
  lockedAt: string;
  /** 推荐候选是否与锚定骨架 100% 对齐 */
  topologyMatch: boolean;
  recommendedAlternativeId?: string;
  /** 拓扑不一致时拒绝应用推荐行程体 */
  recommendedPlanRejected?: boolean;
}

export function extractSegmentIdsFromItinerary(
  itinerary: Itinerary,
  tripId: string,
  routeDirectionId: string,
): string[] {
  const plan = itineraryToRoutePlanDraft(itinerary, tripId, routeDirectionId);
  return (plan.segments ?? []).map((s) => String(s.segmentId ?? ''));
}

export function segmentIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 仅同步时间窗 / 元数据（成本、节奏），禁止增删 item 或改写 segmentId 拓扑。
 */
export function mergeItinerarySlotTimingOnly(anchor: Itinerary, recommended: Itinerary): Itinerary {
  const recById = new Map<string, ItineraryItem>();
  for (const day of recommended.days ?? []) {
    for (const item of day.items ?? []) {
      if (item?.id) recById.set(item.id, item);
    }
  }

  const days: ItineraryDay[] = (anchor.days ?? []).map((day) => ({
    ...day,
    items: (day.items ?? []).map((item) => {
      const rec = item.id ? recById.get(item.id) : undefined;
      if (!rec) return item;
      return {
        ...item,
        start_window: rec.start_window ?? item.start_window,
        end_window: rec.end_window ?? item.end_window,
        metadata: {
          ...(item.metadata ?? {}),
          ...(rec.metadata ?? {}),
          route_topology_locked: true,
        },
      };
    }),
  }));

  return { ...anchor, days };
}

export function buildRouteTopologyLockRecord(params: {
  anchorItinerary: Itinerary;
  tripId: string;
  routeDirectionId: string;
  recommendedItinerary?: Itinerary;
  recommendedAlternativeId?: string;
}): {
  lock: RouteTopologyLockRecord;
  nextItinerary: Itinerary;
} {
  const anchorIds = extractSegmentIdsFromItinerary(
    params.anchorItinerary,
    params.tripId,
    params.routeDirectionId,
  );
  const anchorPlan = itineraryToRoutePlanDraft(
    params.anchorItinerary,
    params.tripId,
    params.routeDirectionId,
  ) as RoutePlanDraft;
  const signature = routeSkeletonSignature(anchorPlan);

  let topologyMatch = true;
  let recommendedPlanRejected = false;
  let nextItinerary = params.anchorItinerary;

  if (params.recommendedItinerary?.days?.length) {
    const candidateIds = extractSegmentIdsFromItinerary(
      params.recommendedItinerary,
      params.tripId,
      params.routeDirectionId,
    );
    topologyMatch = segmentIdsEqual(anchorIds, candidateIds);
    if (topologyMatch) {
      nextItinerary = mergeItinerarySlotTimingOnly(params.anchorItinerary, params.recommendedItinerary);
    } else {
      recommendedPlanRejected = true;
      nextItinerary = params.anchorItinerary;
    }
  }

  return {
    lock: {
      route_skeleton_locked: true,
      lockedSegmentIds: anchorIds,
      routeSkeletonSignature: signature,
      lockedAt: new Date().toISOString(),
      topologyMatch,
      recommendedAlternativeId: params.recommendedAlternativeId,
      recommendedPlanRejected,
    },
    nextItinerary,
  };
}
