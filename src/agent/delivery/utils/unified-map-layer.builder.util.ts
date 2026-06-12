/**
 * 从行程 + 预订快照构建 unified_map_layer@v1
 */

import type { Itinerary, ItineraryItem } from '../../interfaces/trip-plan.interface';
import { buildGoogleMapsDirectionsUrl } from '../../utils/delivery-artifacts-ui.util';
import type {
  UnifiedMapLayerLeg,
  UnifiedMapLayerPayload,
  UnifiedMapLayerPoint,
} from '../types/unified-map-layer.type';
import { UNIFIED_MAP_LAYER_SCHEMA } from '../types/unified-map-layer.type';

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function coordsFromItem(item: ItineraryItem): { lat: number; lng: number } | null {
  const c =
    item.location_ref?.coordinates ??
    (item as { location?: { lat: number; lng: number } }).location;
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function lastItemWithCoords(day: { items?: ItineraryItem[] }): ItineraryItem | null {
  const items = day.items ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (coordsFromItem(items[i])) return items[i];
  }
  return null;
}

export function buildUnifiedMapLayer(input: {
  itinerary?: Itinerary | null;
  tripId?: string | null;
  bookingPayload?: {
    car_rentals?: unknown[] | null;
    accommodation_night_groups?: unknown[] | null;
    accommodations?: unknown[] | null;
  } | null;
}): UnifiedMapLayerPayload | undefined {
  const itinerary = input.itinerary;
  if (!itinerary?.days?.length) return undefined;

  const points: UnifiedMapLayerPoint[] = [];
  const legs: UnifiedMapLayerLeg[] = [];
  const pointIds = new Set<string>();

  const addPoint = (p: UnifiedMapLayerPoint): string | undefined => {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (pointIds.has(p.id)) return p.id;
    pointIds.add(p.id);
    points.push(p);
    return p.id;
  };

  for (let di = 0; di < itinerary.days.length; di++) {
    const day = itinerary.days[di];
    const dayNumber = di + 1;
    for (const item of day.items ?? []) {
      const coord = coordsFromItem(item);
      if (!coord) continue;
      const id = String(item.id ?? `poi_d${dayNumber}_${points.length}`);
      addPoint({
        id,
        kind: 'poi',
        label_zh: item.location_ref?.name?.trim() || String(item.type ?? 'POI'),
        lat: coord.lat,
        lng: coord.lng,
        day_number: dayNumber,
        icon_hint: 'poi',
      });
    }
  }

  const nightGroups = input.bookingPayload?.accommodation_night_groups;
  if (Array.isArray(nightGroups)) {
    for (const raw of nightGroups) {
      if (!raw || typeof raw !== 'object') continue;
      const g = raw as Record<string, unknown>;
      const nightIndex = Number(g.night_index ?? g.nightIndex);
      if (!Number.isFinite(nightIndex)) continue;
      const cards = Array.isArray(g.cards) ? g.cards : [];
      const card = cards[0] as Record<string, unknown> | undefined;
      const lat = Number(card?.listing_lat ?? card?.lat);
      const lng = Number(card?.listing_lng ?? card?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const day = itinerary.days[nightIndex - 1];
        const anchor = day ? lastItemWithCoords(day) : null;
        const ac = anchor ? coordsFromItem(anchor) : null;
        if (!ac) continue;
        addPoint({
          id: `hotel_depot_night_${nightIndex}`,
          kind: 'hotel_depot',
          label_zh: pickStr(g, ['anchor_label_zh']) ?? `第 ${nightIndex} 晚住宿锚点`,
          lat: ac.lat,
          lng: ac.lng,
          day_number: nightIndex,
          night_index: nightIndex,
          icon_hint: 'hotel',
        });
        continue;
      }
      addPoint({
        id: `hotel_depot_night_${nightIndex}`,
        kind: 'hotel_depot',
        label_zh:
          pickStr(card ?? {}, ['name', 'nameCN']) ??
          pickStr(g, ['anchor_label_zh']) ??
          `第 ${nightIndex} 晚酒店`,
        lat,
        lng,
        day_number: nightIndex,
        night_index: nightIndex,
        icon_hint: 'hotel',
      });
    }
  }

  const cars = input.bookingPayload?.car_rentals;
  if (Array.isArray(cars) && cars.length > 0) {
    const c = cars[0] as Record<string, unknown>;
    const pickup = (c.pickup_location ?? c.pickupLocation) as Record<string, unknown> | undefined;
    const dropoff = (c.dropoff_location ?? c.dropoffLocation) as Record<string, unknown> | undefined;
    const pickLat = Number(pickup?.lat);
    const pickLng = Number(pickup?.lng);
    if (Number.isFinite(pickLat) && Number.isFinite(pickLng)) {
      addPoint({
        id: 'car_pickup',
        kind: 'car_pickup',
        label_zh: pickStr(c, ['vehicle_name', 'name']) ?? '取车点',
        lat: pickLat,
        lng: pickLng,
        icon_hint: 'car_pickup',
      });
    }
    const dropLat = Number(dropoff?.lat);
    const dropLng = Number(dropoff?.lng);
    if (Number.isFinite(dropLat) && Number.isFinite(dropLng)) {
      addPoint({
        id: 'car_dropoff',
        kind: 'car_dropoff',
        label_zh: '还车点',
        lat: dropLat,
        lng: dropLng,
        icon_hint: 'car_dropoff',
      });
    }
  }

  for (let di = 0; di < itinerary.days.length; di++) {
    const dayNumber = di + 1;
    const nightIndex = dayNumber;
    const depot = points.find((p) => p.id === `hotel_depot_night_${nightIndex}`);
    const day = itinerary.days[di];
    const lastPoi = day ? lastItemWithCoords(day) : null;
    if (!depot || !lastPoi) continue;
    const poiId = String(lastPoi.id ?? '');
    const poiPoint = points.find((p) => p.id === poiId);
    if (!poiPoint) continue;
    legs.push({
      id: `leg_day${dayNumber}_to_hotel`,
      kind: 'drive',
      from_point_id: poiPoint.id,
      to_point_id: depot.id,
      label_zh: `第 ${dayNumber} 天 → 住宿`,
    });
  }

  const routeCoords = points.map((p) => ({ lat: p.lat, lng: p.lng }));
  const overview_directions_url = buildGoogleMapsDirectionsUrl(routeCoords);

  if (!points.length) return undefined;

  return {
    schema: UNIFIED_MAP_LAYER_SCHEMA,
    ...(input.tripId?.trim() ? { trip_id: input.tripId.trim() } : {}),
    points,
    legs,
    ...(overview_directions_url ? { overview_directions_url } : {}),
    computed_at: new Date().toISOString(),
  };
}
