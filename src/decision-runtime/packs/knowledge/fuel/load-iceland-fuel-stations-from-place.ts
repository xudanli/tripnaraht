/**
 * Load Iceland fuel stations from Place (read-only). Not an insert/upsert into DB.
 */

import { Prisma } from '@prisma/client';
import { ICELAND_FUEL_CANONICAL_TYPES } from '../../../../places/types/iceland-poi-categories';
import type { IcelandFuelStationProfile } from './iceland-fuel.types';
import {
  projectPlaceRowsToFuelStationProfiles,
  type PlaceFuelStationRow,
} from './project-place-fuel-station';

type PrismaLike = {
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) => Promise<T>;
};

const TTL_MS = 15 * 60 * 1000;
let memo: { at: number; stations: IcelandFuelStationProfile[] } | null = null;

/** Sync snapshot after a successful load (may be empty). */
export function getCachedIcelandPlaceFuelStations(): IcelandFuelStationProfile[] {
  return memo?.stations ?? [];
}

export async function loadIcelandFuelStationsFromPlace(
  prisma: PrismaLike,
): Promise<IcelandFuelStationProfile[]> {
  const typeList = Prisma.join(
    [...ICELAND_FUEL_CANONICAL_TYPES].map((t) => Prisma.sql`${t}`),
  );

  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      nameEN: string | null;
      nameCN: string | null;
      lat: number;
      lng: number;
      canonicalType: string;
      cityNameEN: string | null;
      openingHours: string | null;
      selfService: string | null;
      fuelDiesel: string | null;
      fuelOctane95: string | null;
    }>
  >`
    SELECT
      p.id,
      p."nameEN",
      p."nameCN",
      ST_Y(p.location::geometry) as lat,
      ST_X(p.location::geometry) as lng,
      p.metadata->>'canonicalType' as "canonicalType",
      c."nameEN" as "cityNameEN",
      p.metadata->>'openingHours' as "openingHours",
      p.metadata->>'selfService' as "selfService",
      p.metadata->>'fuelDiesel' as "fuelDiesel",
      p.metadata->>'fuelOctane95' as "fuelOctane95"
    FROM "Place" p
    JOIN "City" c ON c.id = p."cityId"
    WHERE c."countryCode" = 'IS'
      AND p.location IS NOT NULL
      AND p.metadata->>'canonicalType' IN (${typeList})
  `;

  const mapped: PlaceFuelStationRow[] = rows
    .filter((r) => r.canonicalType && Number.isFinite(Number(r.lat)))
    .map((r) => ({
      id: Number(r.id),
      nameEN: r.nameEN,
      nameCN: r.nameCN,
      lat: Number(r.lat),
      lng: Number(r.lng),
      canonicalType: r.canonicalType,
      cityNameEN: r.cityNameEN,
      openingHours: r.openingHours,
      selfService: r.selfService,
      fuelDiesel: r.fuelDiesel,
      fuelOctane95: r.fuelOctane95,
    }));

  const stations = projectPlaceRowsToFuelStationProfiles(mapped);
  memo = { at: Date.now(), stations };
  return stations;
}

export async function loadIcelandFuelStationsFromPlaceCached(
  prisma: PrismaLike,
): Promise<IcelandFuelStationProfile[]> {
  if (memo && Date.now() - memo.at < TTL_MS) {
    return memo.stations;
  }
  return loadIcelandFuelStationsFromPlace(prisma);
}
