// src/skills/itinerary/itinerary-trip-poi-hydration.util.ts
/**
 * 将 Trips 库中已持久化的行程项合并进 research_data.poi_evidence，
 * 供 itinerary.generate / IncrementalItineraryGenerator 使用真实槽位与 POI。
 */

import { DateTime } from 'luxon';
import type { PrismaService } from '../../prisma/prisma.service';

export interface TripPoiEvidencePatch {
  pois: any[];
  slots_by_day: any[][];
}

function coordsFromPlaceMetadata(place: { metadata?: unknown }): { lat: number; lng: number } | undefined {
  const metadata = (place.metadata as Record<string, unknown>) || {};
  const lat = metadata.lat ?? metadata.latitude;
  const lng = metadata.lng ?? metadata.longitude ?? metadata.lon;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  const c = metadata.coordinates;
  if (Array.isArray(c) && c.length >= 2) {
    const lngN = Number(c[0]);
    const latN = Number(c[1]);
    if (Number.isFinite(latN) && Number.isFinite(lngN)) return { lat: latN, lng: lngN };
  }
  return undefined;
}

function formatHhmm(d: Date | null | undefined): string | undefined {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return undefined;
  return DateTime.fromJSDate(d).toFormat('HH:mm');
}

function itineraryItemToPoi(
  tripId: string,
  dayOrdinal: number,
  item: {
    id: string;
    type: string;
    startTime: Date | null;
    endTime: Date | null;
    order: number | null;
    Place: {
      id: number;
      nameCN: string;
      nameEN: string | null;
      address: string | null;
      category: string;
      metadata?: unknown;
    };
  },
  coordByPlaceId: Map<number, { lat: number; lng: number }>,
): any {
  const p = item.Place;
  const coords = coordByPlaceId.get(p.id) ?? coordsFromPlaceMetadata(p);
  let st = formatHhmm(item.startTime);
  let en = formatHhmm(item.endTime);
  if (st && !en) {
    en = DateTime.fromFormat(st, 'HH:mm').plus({ hours: 2 }).toFormat('HH:mm');
  }
  return {
    poi_id: String(p.id),
    id: String(p.id),
    name: p.nameCN || p.nameEN || '地点',
    nameCN: p.nameCN,
    nameEN: p.nameEN ?? undefined,
    address: p.address ?? undefined,
    ...(coords ? { coordinates: coords } : {}),
    evidence_id: `trip_${tripId}_item_${item.id}`,
    ...(st && en ? { start_window: st, end_window: en } : {}),
    day: dayOrdinal,
    order: item.order ?? 0,
    metadata: { source: 'trip_db', itinerary_item_type: item.type, itinerary_item_id: item.id },
  };
}

/**
 * 从 Trip 记录构建 pois 目录 + slots_by_day（与 IncrementalItineraryGenerator 约定一致）。
 */
export async function loadTripPoiEvidencePatch(prisma: PrismaService, tripId: string): Promise<TripPoiEvidencePatch | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            include: {
              Place: true,
            },
          },
        },
      },
    },
  });

  if (!trip?.TripDay?.length) return null;

  const placeIds = Array.from(
    new Set(
      trip.TripDay.flatMap((d) =>
        d.ItineraryItem.filter((it) => it.placeId && it.Place).map((it) => it.placeId!),
      ),
    ),
  );

  const coordByPlaceId = new Map<number, { lat: number; lng: number }>();
  if (placeIds.length > 0) {
    try {
      const rows = await prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
        SELECT
          id,
          ST_Y(location::geometry) AS lat,
          ST_X(location::geometry) AS lng
        FROM "Place"
        WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
      `;
      for (const r of rows) {
        coordByPlaceId.set(r.id, { lat: Number(r.lat), lng: Number(r.lng) });
      }
    } catch {
      // PostGIS 不可用时仅依赖 metadata
    }
    for (const day of trip.TripDay) {
      for (const it of day.ItineraryItem) {
        if (it.Place && !coordByPlaceId.has(it.Place.id)) {
          const c = coordsFromPlaceMetadata(it.Place);
          if (c) coordByPlaceId.set(it.Place.id, c);
        }
      }
    }
  }

  const catalog = new Map<string, any>();
  const slots_by_day: any[][] = [];

  trip.TripDay.forEach((day, dayIdx) => {
    const dayOrdinal = dayIdx + 1;
    const row: any[] = [];
    const items = day.ItineraryItem.filter((it) => it.placeId && it.Place);
    for (const it of items) {
      const poi = itineraryItemToPoi(trip.id, dayOrdinal, it as any, coordByPlaceId);
      const id = String(poi.poi_id);
      if (!catalog.has(id)) catalog.set(id, poi);
      else {
        const prev = catalog.get(id);
        catalog.set(id, { ...prev, ...poi, evidence_id: poi.evidence_id });
      }
      row.push({ poi_id: id });
    }
    slots_by_day.push(row);
  });

  if (slots_by_day.every((r) => r.length === 0)) return null;

  return { pois: [...catalog.values()], slots_by_day };
}

/**
 * Trip 槽位优先：写入 slots_by_day，并把 Trip 中的 POI 置于 pois 列表前部（与 research 去重合并）。
 */
export function applyTripPoiEvidencePatch(
  researchData: Record<string, any> | undefined,
  patch: TripPoiEvidencePatch | null,
): Record<string, any> | undefined {
  if (!patch) return researchData;
  const base = researchData ? { ...researchData } : {};
  const baseEv = base.poi_evidence;
  const baseIsArr = Array.isArray(baseEv);
  const baseObj = baseIsArr ? {} : typeof baseEv === 'object' && baseEv ? { ...baseEv } : {};
  const basePois = baseIsArr ? baseEv : baseEv?.pois ?? [];

  const seen = new Set<string>();
  const merged: any[] = [];
  for (const p of patch.pois) {
    const id = String(p.poi_id ?? p.id ?? '');
    if (!id) continue;
    seen.add(id);
    merged.push(p);
  }
  for (const p of basePois) {
    const id = String(p.poi_id ?? p.id ?? '');
    if (id && !seen.has(id)) {
      seen.add(id);
      merged.push(p);
    }
  }

  base.poi_evidence = {
    ...baseObj,
    pois: merged,
    slots_by_day: patch.slots_by_day,
    trip_slot_source: 'trip_db',
  };
  return base;
}
