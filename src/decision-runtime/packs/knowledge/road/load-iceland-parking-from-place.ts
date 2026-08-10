/**
 * Load Iceland parking Places (read-only). Used by daily-drive ROAD parkingSpots.
 */

import { Prisma } from '@prisma/client';

export type PlaceParkingRow = {
  id: number;
  nameEN: string | null;
  nameCN: string | null;
  lat: number;
  lng: number;
  canonicalType: string;
};

type PrismaLike = {
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) => Promise<T>;
};

const TTL_MS = 15 * 60 * 1000;
let memo: { at: number; rows: PlaceParkingRow[] } | null = null;

const PARKING_TYPES = ['PARKING', 'PARKING_FREE', 'PARKING_PAID'] as const;

export function getCachedIcelandPlaceParking(): PlaceParkingRow[] {
  return memo?.rows ?? [];
}

export async function loadIcelandParkingFromPlace(
  prisma: PrismaLike,
): Promise<PlaceParkingRow[]> {
  const typeList = Prisma.join([...PARKING_TYPES].map((t) => Prisma.sql`${t}`));

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

  memo = { at: Date.now(), rows: mapped };
  return mapped;
}

export async function loadIcelandParkingFromPlaceCached(
  prisma: PrismaLike,
): Promise<PlaceParkingRow[]> {
  if (memo && Date.now() - memo.at < TTL_MS) {
    return memo.rows;
  }
  return loadIcelandParkingFromPlace(prisma);
}
