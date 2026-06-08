/**
 * 从 Prisma Trip 加载邻日锚点所需的日序 + 坐标，以及非目标日行程保留块。
 */

import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ItineraryDay, ItineraryItem } from '../interfaces/trip-plan.interface';
import {
  type TripDayAnchorItem,
  type TripDayAnchorRow,
  extractNeighborAnchors,
  buildItineraryAdjustSpatialConstraints,
  type NeighborAnchorContext,
  type ItineraryAdjustSpatialConstraints,
  coordsFromPoiLike,
} from './itinerary-adjust-neighbor-anchors.util';

function coordsFromPlaceMetadata(place: { metadata?: unknown }): { lat: number; lng: number } | undefined {
  const metadata = (place.metadata as Record<string, unknown>) || {};
  const lat = metadata.lat ?? metadata.latitude;
  const lng = metadata.lng ?? metadata.longitude ?? metadata.lon;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return undefined;
}

function formatHhmm(d: Date | null | undefined): string | undefined {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return undefined;
  return DateTime.fromJSDate(d).toFormat('HH:mm');
}

export async function loadTripDayAnchorRows(
  prisma: PrismaService,
  tripId: string,
  userId?: string,
): Promise<TripDayAnchorRow[]> {
  const tid = tripId.trim();
  if (!tid) return [];

  if (userId?.trim()) {
    const collaborator = await prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId: tid, userId: userId.trim() } },
    });
    if (!collaborator) return [];
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tid },
    include: {
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            include: { Place: true },
          },
        },
      },
    },
  });
  if (!trip?.TripDay?.length) return [];

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
        SELECT id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id IN (${Prisma.join(placeIds)})
          AND location IS NOT NULL
      `;
      for (const r of rows) {
        coordByPlaceId.set(r.id, { lat: Number(r.lat), lng: Number(r.lng) });
      }
    } catch {
      // PostGIS unavailable
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

  return trip.TripDay.map((day, idx) => {
    const dateIso = day.date ? day.date.toISOString().slice(0, 10) : `D${idx + 1}`;
    const items: TripDayAnchorItem[] = day.ItineraryItem.map((it) => {
      const place = it.Place;
      const pid = it.placeId ?? place?.id;
      const c = pid != null ? coordByPlaceId.get(pid) : undefined;
      return {
        type: it.type,
        placeId: pid ?? null,
        lat: c?.lat ?? null,
        lng: c?.lng ?? null,
        name: place?.nameCN ?? place?.nameEN ?? it.note ?? null,
        startTime: it.startTime,
        order: it.order,
      };
    });
    return { dateIso, dayNumber: idx + 1, items };
  });
}

export async function resolveItineraryAdjustNeighborContext(
  prisma: PrismaService,
  tripId: string,
  targetDateIso: string,
  userId?: string,
  maxDetourKm = 50,
): Promise<{
  anchors: NeighborAnchorContext;
  spatial: ItineraryAdjustSpatialConstraints;
  dayRows: TripDayAnchorRow[];
} | null> {
  const dayRows = await loadTripDayAnchorRows(prisma, tripId, userId);
  const anchors = extractNeighborAnchors(dayRows, targetDateIso);
  if (!anchors) return null;
  return {
    anchors,
    spatial: buildItineraryAdjustSpatialConstraints(anchors, maxDetourKm),
    dayRows,
  };
}

function itineraryItemFromTripRow(
  requestId: string,
  dayNumber: number,
  itemIndex: number,
  it: {
    id: string;
    type: string;
    startTime: Date | null;
    endTime: Date | null;
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
): ItineraryItem {
  const p = it.Place;
  const coords = coordByPlaceId.get(p.id) ?? coordsFromPlaceMetadata(p);
  let st = formatHhmm(it.startTime);
  let en = formatHhmm(it.endTime);
  if (st && !en) {
    en = DateTime.fromFormat(st, 'HH:mm').plus({ hours: 2 }).toFormat('HH:mm');
  }
  return {
    id: `${requestId}_tripdb_day${dayNumber}_item${itemIndex + 1}`,
    type: (it.type === 'REST' || it.type === 'TRANSIT' ? it.type : 'POI') as ItineraryItem['type'],
    start_window: st ?? '09:00',
    end_window: en ?? '11:00',
    location_ref: {
      place_id: String(p.id),
      name: p.nameCN || p.nameEN || '地点',
      ...(coords ? { coordinates: coords } : {}),
      address: p.address ?? undefined,
    },
    evidence_refs: [`trip_db_item_${it.id}`],
    verified: false,
    verification_status: 'UNVERIFIED',
    metadata: {
      duration_minutes: 120,
      slot_source: 'trip_db_preserve',
      time_source: 'trip_db',
    },
  };
}

/** 将 Trip 库内非目标日块覆盖进 PLAN_GEN 产出（仅保留目标日新生成内容）。 */
export async function mergeItineraryAdjustPreserveNonTargetDays(
  prisma: PrismaService,
  tripId: string,
  targetDateIso: string,
  generatedDays: ItineraryDay[],
  requestId: string,
): Promise<ItineraryDay[]> {
  const target = targetDateIso.slice(0, 10);
  const tid = tripId.trim();
  if (!tid || !generatedDays.length) return generatedDays;

  const trip = await prisma.trip.findUnique({
    where: { id: tid },
    include: {
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            include: { Place: true },
          },
        },
      },
    },
  });
  if (!trip?.TripDay?.length) return generatedDays;

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
        SELECT id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id IN (${Prisma.join(placeIds)})
          AND location IS NOT NULL
      `;
      for (const r of rows) {
        coordByPlaceId.set(r.id, { lat: Number(r.lat), lng: Number(r.lng) });
      }
    } catch {
      // ignore
    }
  }

  const dbDayByDate = new Map<string, ItineraryDay>();
  trip.TripDay.forEach((day, idx) => {
    const dateIso = day.date ? day.date.toISOString().slice(0, 10) : '';
    if (!dateIso || dateIso === target) return;
    const items = day.ItineraryItem.filter((it) => it.Place)
      .map((it, itemIdx) =>
        itineraryItemFromTripRow(requestId, idx + 1, itemIdx, it as any, coordByPlaceId),
      );
    if (items.length === 0) return;
    dbDayByDate.set(dateIso, { date: dateIso, items });
  });

  return generatedDays.map((d) => {
    const date = String(d.date ?? '').slice(0, 10);
    if (date === target) return d;
    return dbDayByDate.get(date) ?? d;
  });
}

export function applyCorridorResearchMarkers(
  researchData: Record<string, unknown>,
  targetDateIso: string,
  anchors: NeighborAnchorContext,
  spatial: ItineraryAdjustSpatialConstraints,
  targetDayNumber: number,
  selectedPois: unknown[],
): Record<string, unknown> {
  const slotsRow = selectedPois.map((p) => {
    const poi = p as Record<string, unknown>;
    return { poi_id: String(poi.poi_id ?? poi.id ?? '') };
  });
  const slotsByDay: unknown[][] = [];
  const dayIdx = Math.max(0, targetDayNumber - 1);
  while (slotsByDay.length <= dayIdx) slotsByDay.push([]);
  slotsByDay[dayIdx] = slotsRow;

  const raw = researchData.poi_evidence;
  const ev =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : { pois: Array.isArray(raw) ? raw : [] };

  return {
    ...researchData,
    poi_evidence: {
      ...ev,
      slots_by_day: slotsByDay,
      itinerary_adjust_corridor: true,
    },
    __itinerary_adjust_target_date_iso: targetDateIso,
    __itinerary_adjust_neighbor_anchors: anchors,
    __itinerary_adjust_spatial: spatial,
    __itinerary_adjust_mode: 'DAY_REPLAN_INTERPOLATION',
  };
}

export { coordsFromPoiLike };
