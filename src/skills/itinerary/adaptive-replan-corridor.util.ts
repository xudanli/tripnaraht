/**
 * Stage 2: POI CORRIDOR FILTERING — 空间/路况/营业可达性过滤
 */

import type { Itinerary, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type {
  ConstraintParseResult,
  CorridorFilterResult,
  TrafficMatrixEntry,
} from './adaptive-replan.types';
import { computeTrafficReachabilityDemotion } from './adaptive-replan-constraint-parser.util';

function cloneItinerary(it: Itinerary): Itinerary {
  return {
    ...it,
    days: it.days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({ ...item })),
    })),
  };
}

function defaultStayMinutes(item: ItineraryItem): number {
  return item.metadata?.duration_minutes ?? 90;
}

function findTrafficFactor(
  item: ItineraryItem,
  prev: ItineraryItem | undefined,
  traffic: TrafficMatrixEntry[] | undefined,
): number {
  if (!traffic?.length || !prev) return 1.0;
  const fromId = prev.location_ref.place_id;
  const toId = item.location_ref.place_id;
  const match = traffic.find(
    (t) =>
      (fromId && t.from_place_id === fromId && toId && t.to_place_id === toId) ||
      (prev.location_ref.coordinates &&
        item.location_ref.coordinates &&
        t.from_coords?.lat === prev.location_ref.coordinates.lat &&
        t.to_coords?.lat === item.location_ref.coordinates.lat),
  );
  return match?.blocked ? Infinity : (match?.traffic_factor ?? 1.0);
}

function scorePoiPhysicalCost(item: ItineraryItem, trafficFactor: number): number {
  const stay = defaultStayMinutes(item);
  const drive = (item.metadata?.duration_minutes ?? 60) * trafficFactor;
  return drive / Math.max(stay, 30);
}

export function filterItineraryCorridor(params: {
  itinerary: Itinerary;
  targetDays: number[];
  constraintParse: ConstraintParseResult;
  trafficStatus?: TrafficMatrixEntry[];
}): CorridorFilterResult {
  const working = cloneItinerary(params.itinerary);
  const demoted_poi_ids: string[] = [];
  const removed_item_ids: string[] = [];
  const rationale_zh: string[] = [];
  const blockedIds = new Set(
    params.constraintParse.blockedSegments.flatMap((s) =>
      [s.from_place_id, s.to_place_id].filter(Boolean) as string[],
    ),
  );

  for (let i = 0; i < working.days.length; i++) {
    const dayNumber = i + 1;
    if (!params.targetDays.includes(dayNumber)) continue;

    const day = working.days[i];
    const kept: ItineraryItem[] = [];

    for (let j = 0; j < day.items.length; j++) {
      const item = day.items[j];
      const prev = j > 0 ? day.items[j - 1] : undefined;

      if (item.type !== 'POI') {
        kept.push(item);
        continue;
      }

      const placeId = item.location_ref.place_id;
      if (placeId && blockedIds.has(placeId)) {
        removed_item_ids.push(item.id);
        rationale_zh.push(`「${item.location_ref.name}」所在路段封禁，已剔除`);
        continue;
      }

      const trafficFactor = findTrafficFactor(item, prev, params.trafficStatus);
      if (trafficFactor === Infinity) {
        removed_item_ids.push(item.id);
        rationale_zh.push(`「${item.location_ref.name}」路况不可达，已剔除`);
        continue;
      }

      const stay = defaultStayMinutes(item);
      const baseDrive = item.metadata?.duration_minutes ?? 60;
      if (
        computeTrafficReachabilityDemotion(
          baseDrive,
          trafficFactor * params.constraintParse.weights.trafficFactorMultiplier,
          stay,
        )
      ) {
        demoted_poi_ids.push(placeId ?? item.id);
        rationale_zh.push(
          `「${item.location_ref.name}」通行时间超过建议停留 50%，降级为备选`,
        );
        continue;
      }

      if (scorePoiPhysicalCost(item, trafficFactor) > 1.2) {
        demoted_poi_ids.push(placeId ?? item.id);
        rationale_zh.push(`「${item.location_ref.name}」空间成本偏高，降级为备选`);
        continue;
      }

      kept.push(item);
    }

    day.items = kept;
  }

  return {
    itinerary: working,
    demoted_poi_ids,
    removed_item_ids,
    rationale_zh,
  };
}
