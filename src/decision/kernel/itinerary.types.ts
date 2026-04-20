import type { ItineraryItem as ContractItineraryItem } from '../../agent/interfaces/trip-plan.interface';

/**
 * 内核层归一化行程项（物理画像）。
 *
 * 注意：此接口刻意与 `agent/interfaces/trip-plan.interface.ts#ItineraryItem` 保持镜像，
 * 但增加了确定性修复算子所需的若干字段（类别、地理桶、锚点）。
 * 算子应基于接收到的任何形状进行归一化，而非假设输入完美无缺。
 */
export interface ItineraryItemPhysicalProfile {
  id: string;
  poiId?: string;
  type?: string;
  category?: string;
  location?: { lat: number; lng: number; geoBucket?: string };
  timeWindow?: { start: string; end: string; durationMin?: number };
  isAnchor?: boolean;
}

export function toGeoBucket(lat: number, lng: number, precision = 2): string {
  const p = Math.max(0, Math.min(6, precision));
  const f = Math.pow(10, p);
  const a = Math.round(lat * f) / f;
  const b = Math.round(lng * f) / f;
  return `${a.toFixed(p)},${b.toFixed(p)}`;
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function normalizeItem(
  item: unknown,
  opts?: { anchors?: Set<string>; categoryHint?: string },
): ItineraryItemPhysicalProfile | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const it = item as Partial<ContractItineraryItem> & Record<string, unknown>;
  const id = typeof it.id === 'string' ? it.id : typeof it['item_id'] === 'string' ? (it['item_id'] as string) : undefined;
  if (!id) return undefined;

  const placeId =
    typeof it.location_ref?.place_id === 'string'
      ? it.location_ref.place_id
      : typeof it['poi_id'] === 'string'
        ? (it['poi_id'] as string)
        : typeof it['place_id'] === 'string'
          ? (it['place_id'] as string)
          : undefined;

  const coords =
    it.location_ref?.coordinates && typeof it.location_ref.coordinates.lat === 'number' && typeof it.location_ref.coordinates.lng === 'number'
      ? { lat: it.location_ref.coordinates.lat, lng: it.location_ref.coordinates.lng }
      : (typeof it['lat'] === 'number' && typeof it['lng'] === 'number')
        ? { lat: it['lat'] as number, lng: it['lng'] as number }
        : undefined;

  const durationMin =
    typeof it.metadata?.duration_minutes === 'number'
      ? it.metadata.duration_minutes
      : typeof it['duration_min'] === 'number'
        ? (it['duration_min'] as number)
        : undefined;

  const start = typeof it.start_window === 'string' ? it.start_window : typeof it['start'] === 'string' ? (it['start'] as string) : undefined;
  const end = typeof it.end_window === 'string' ? it.end_window : typeof it['end'] === 'string' ? (it['end'] as string) : undefined;

  const isAnchor = !!(placeId && opts?.anchors?.has(String(placeId)));

  return {
    id,
    poiId: placeId ? String(placeId) : undefined,
    type: typeof it.type === 'string' ? it.type : undefined,
    category: typeof (it as any).category === 'string' ? String((it as any).category) : opts?.categoryHint,
    location: coords ? { ...coords, geoBucket: toGeoBucket(coords.lat, coords.lng) } : undefined,
    timeWindow: start && end ? { start, end, durationMin } : durationMin !== undefined ? { start: '', end: '', durationMin } : undefined,
    isAnchor,
  };
}

