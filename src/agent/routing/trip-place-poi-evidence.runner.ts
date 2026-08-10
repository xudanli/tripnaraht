/**
 * ITINERARY_ADJUST：从绑定 Trip 的行程项 Place 登记种子化 poi_evidence（从 ClaudeOrchestrator 迁出）。
 */

import { Prisma } from '@prisma/client';
import type { TripPlacePoiEvidenceHost } from './trip-place-poi-evidence.host';
import {
  mapTripPlacesToPoiEvidence,
  type TripPlaceRowForPoiEvidence,
} from '../utils/itinerary-adjust-intent.util';

export async function loadTripPlacePoiEvidenceForAdjust(
  host: TripPlacePoiEvidenceHost,
  tripId: string,
  userId?: string,
): Promise<Array<Record<string, unknown>>> {
  const tid = tripId.trim();
  if (!tid) return [];

  const uid = userId?.trim();
  if (uid) {
    const collaborator = await host.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId: tid, userId: uid } },
    });
    if (!collaborator) return [];
  }

  const placeIds = await host.prisma.itineraryItem.findMany({
    where: {
      placeId: { not: null },
      TripDay: { tripId: tid },
    },
    select: { placeId: true },
    distinct: ['placeId'],
  });
  const ids = placeIds
    .map((r) => r.placeId)
    .filter((id): id is number => typeof id === 'number' && id > 0);
  if (!ids.length) return [];

  const places = await host.prisma.place.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      nameCN: true,
      nameEN: true,
      category: true,
      address: true,
    },
  });

  const coordRows = await host.prisma.$queryRaw<
    Array<{ id: number; lat: number | null; lng: number | null }>
  >`
    SELECT id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
    FROM "Place"
    WHERE id IN (${Prisma.join(ids)})
      AND location IS NOT NULL
  `;
  const coordById = new Map(coordRows.map((r) => [r.id, r]));

  const rows: TripPlaceRowForPoiEvidence[] = places.map((p) => {
    const c = coordById.get(p.id);
    return {
      id: p.id,
      nameCN: p.nameCN,
      nameEN: p.nameEN,
      category: String(p.category),
      address: p.address,
      lat: c?.lat != null ? Number(c.lat) : null,
      lng: c?.lng != null ? Number(c.lng) : null,
    };
  });
  return mapTripPlacesToPoiEvidence(rows);
}
