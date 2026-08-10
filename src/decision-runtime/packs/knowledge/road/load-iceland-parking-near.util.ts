/**
 * Load Iceland parking Places near a point (read-only).
 * Prefer ST_DWithin over full-country scan (5k+ rows).
 */

import { Prisma } from '@prisma/client';
import type { PlaceParkingRow } from './load-iceland-parking-from-place';

type PrismaLike = {
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) => Promise<T>;
};

const PARKING_TYPES = ['PARKING', 'PARKING_FREE', 'PARKING_PAID'] as const;
const NEAR_TTL_MS = 60_000;
const nearMemo = new Map<string, { at: number; rows: PlaceParkingRow[] }>();

function cellKey(lat: number, lng: number, radiusKm: number): string {
  // ~11km grid
  return `${(lat * 10).toFixed(0)}:${(lng * 10).toFixed(0)}:r${radiusKm}`;
}

export async function loadIcelandParkingNearPoint(
  prisma: PrismaLike,
  opts: { lat: number; lng: number; radiusKm?: number; limit?: number },
): Promise<PlaceParkingRow[]> {
  const radiusKm = opts.radiusKm ?? 80;
  const limit = opts.limit ?? 40;
  const key = cellKey(opts.lat, opts.lng, radiusKm);
  const hit = nearMemo.get(key);
  if (hit && Date.now() - hit.at < NEAR_TTL_MS) return hit.rows;

  const typeList = Prisma.join([...PARKING_TYPES].map((t) => Prisma.sql`${t}`));
  const radiusM = Math.round(radiusKm * 1000);

  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      nameEN: string | null;
      nameCN: string | null;
      lat: number;
      lng: number;
      canonicalType: string;
    }>
  >`
    SELECT
      p.id,
      p."nameEN",
      p."nameCN",
      ST_Y(p.location::geometry) as lat,
      ST_X(p.location::geometry) as lng,
      p.metadata->>'canonicalType' as "canonicalType"
    FROM "Place" p
    JOIN "City" c ON c.id = p."cityId"
    WHERE c."countryCode" = 'IS'
      AND p.location IS NOT NULL
      AND p.metadata->>'canonicalType' IN (${typeList})
      AND ST_DWithin(
        p.location,
        ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography,
        ${radiusM}
      )
    ORDER BY p.location <-> ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography
    LIMIT ${limit}
  `;

  const mapped = rows
    .filter((r) => r.canonicalType && Number.isFinite(Number(r.lat)))
    .map((r) => ({
      id: Number(r.id),
      nameEN: r.nameEN,
      nameCN: r.nameCN,
      lat: Number(r.lat),
      lng: Number(r.lng),
      canonicalType: r.canonicalType,
    }));

  nearMemo.set(key, { at: Date.now(), rows: mapped });
  return mapped;
}
