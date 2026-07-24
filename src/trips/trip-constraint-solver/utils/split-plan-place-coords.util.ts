import type { PrismaService } from '../../../prisma/prisma.service';

export type PlaceCoord = { lat: number; lng: number };

export function haversineDistanceKm(a: PlaceCoord, b: PlaceCoord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sin), Math.sqrt(1 - sin));
}

/** 冰岛公路粗略估算：直线 × 1.25 弯道系数，均速 ~65 km/h */
export function estimateDriveMinutes(straightKm: number): number {
  const roadKm = straightKm * 1.25;
  return Math.max(5, Math.round((roadKm / 65) * 60));
}

export function coordsFromPlaceMetadata(metadata: unknown): PlaceCoord | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.lat === 'number' && typeof m.lng === 'number') {
    return { lat: m.lat, lng: m.lng };
  }
  const c = m.coordinates;
  if (Array.isArray(c) && c.length >= 2) {
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

export async function loadPlaceCoordinatesMap(
  prisma: PrismaService,
  placeIds: number[],
): Promise<Map<number, PlaceCoord>> {
  const ids = [...new Set(placeIds.filter((id) => Number.isInteger(id) && id > 0))];
  const map = new Map<number, PlaceCoord>();
  if (ids.length === 0) return map;

  try {
    const rows = await prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
      SELECT
        id,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM "Place"
      WHERE id = ANY(${ids}::int[]) AND location IS NOT NULL
    `;
    for (const row of rows ?? []) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        map.set(row.id, { lat, lng });
      }
    }
  } catch {
    // PostGIS 不可用时仅依赖 metadata
  }
  return map;
}
