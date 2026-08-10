/**
 * 行中 / 快速操作共用：走廊下一油站 & 附近安全停车（真实 POI，禁止编造）。
 */

import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';
import { haversineKm } from '../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import { resolveIcelandSafeStop } from '../../decision-runtime/packs/knowledge/road/resolve-iceland-safe-stop';
import { loadIcelandParkingNearPoint } from '../../decision-runtime/packs/knowledge/road/load-iceland-parking-near.util';
import {
  getCachedIcelandPlaceFuelStations,
  loadIcelandFuelStationsFromPlaceCached,
} from '../../decision-runtime/packs/knowledge/fuel/load-iceland-fuel-stations-from-place';
import { loadIcelandFuelStationProfiles } from '../../decision-runtime/packs/knowledge/fuel/iceland-fuel.loader';
import { DEFAULT_TRIP_DISPLAY_TIMEZONE } from '../../common/utils/format-clock-label.util';
import { resolveDayNumber } from './mobile-execution.util';
import {
  buildLightTripPlanFromWaypoints,
  projectFuelStationsOntoTripCorridor,
  type CorridorDayWaypoints,
} from './daily-drive-fuel-corridor.projection.util';

export type CorridorPoiHit = {
  placeId: string;
  placeNameZh: string;
  distanceKm: number;
  durationMin: number;
  lat?: number;
  lng?: number;
  kind: 'fuel' | 'safe_parking' | 'toilet' | 'food';
};

type PrismaTripLike = {
  tripDay: {
    findMany: (args?: any) => Promise<
      Array<{
        date: Date;
        ItineraryItem: Array<{ placeId: number | null }>;
      }>
    >;
  };
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) => Promise<T>;
};

/** Accept PrismaService without fighting generated findMany generics. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CorridorPrisma = any;

const AVG_KMH = 80;

function durationMinFromKm(km: number): number {
  return Math.max(1, Math.round((km / AVG_KMH) * 60));
}

async function loadCorridorWaypoints(
  prisma: CorridorPrisma,
  tripId: string,
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
  localDate: string,
  timezone: string,
): Promise<CorridorDayWaypoints[]> {
  const db = prisma as PrismaTripLike;
  if (!startDate || !endDate) return [];
  const dayNumber = resolveDayNumber(
    startDate,
    endDate,
    DateTime.fromISO(localDate, { zone: timezone }).isValid
      ? DateTime.fromISO(localDate, { zone: timezone })
      : DateTime.now().setZone(timezone),
  );
  const days = await db.tripDay.findMany({
    where: { tripId },
    orderBy: { date: 'asc' },
    skip: Math.max(0, dayNumber - 1),
    take: 2,
    select: {
      date: true,
      ItineraryItem: {
        orderBy: { startTime: 'asc' },
        select: { placeId: true },
      },
    },
  });
  if (!days.length) return [];

  const placeIds = [
    ...new Set(
      days.flatMap((d) =>
        d.ItineraryItem.map((i) => i.placeId).filter(
          (id): id is number => typeof id === 'number' && id > 0,
        ),
      ),
    ),
  ];
  if (!placeIds.length) return [];

  const coords = await db.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
    SELECT
      p.id,
      ST_Y(p.location::geometry) as lat,
      ST_X(p.location::geometry) as lng
    FROM "Place" p
    WHERE p.id IN (${Prisma.join(placeIds)})
      AND p.location IS NOT NULL
  `;
  const byId = new Map(
    coords
      .filter((c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)))
      .map((c) => [Number(c.id), { lat: Number(c.lat), lng: Number(c.lng) }] as const),
  );

  return days.map((d) => {
    const date =
      d.date instanceof Date
        ? DateTime.fromJSDate(d.date).toISODate() ?? localDate
        : String(d.date).slice(0, 10);
    const points = d.ItineraryItem.map((i) =>
      i.placeId != null ? byId.get(i.placeId) : undefined,
    ).filter((p): p is { lat: number; lng: number } => !!p);
    const deduped: { lat: number; lng: number }[] = [];
    for (const p of points) {
      const last = deduped[deduped.length - 1];
      if (
        last &&
        Math.abs(last.lat - p.lat) < 1e-5 &&
        Math.abs(last.lng - p.lng) < 1e-5
      ) {
        continue;
      }
      deduped.push(p);
    }
    return { date, points: deduped };
  });
}

async function loadPlaceFuelSafe(prisma: CorridorPrisma) {
  try {
    return await loadIcelandFuelStationsFromPlaceCached(prisma as PrismaTripLike);
  } catch {
    return getCachedIcelandPlaceFuelStations();
  }
}

/** 走廊下一可靠油站；无走廊/无站返回 undefined（不编造 km）。 */
export async function resolveNextFuelAlongCorridor(
  prisma: CorridorPrisma,
  opts: {
    tripId: string;
    startDate?: Date | null;
    endDate?: Date | null;
    timezone?: string;
    localDate?: string;
  },
): Promise<CorridorPoiHit | undefined> {
  const timezone = opts.timezone ?? DEFAULT_TRIP_DISPLAY_TIMEZONE;
  const localDate =
    opts.localDate ??
    DateTime.now().setZone(timezone).toISODate() ??
    new Date().toISOString().slice(0, 10);

  const [placeStations, waypoints, packStations] = await Promise.all([
    loadPlaceFuelSafe(prisma),
    loadCorridorWaypoints(
      prisma,
      opts.tripId,
      opts.startDate,
      opts.endDate,
      localDate,
      timezone,
    ),
    Promise.resolve(loadIcelandFuelStationProfiles().stations),
  ]);

  const plan = buildLightTripPlanFromWaypoints(waypoints, opts.tripId);
  if (!plan) return undefined;

  const corridor = projectFuelStationsOntoTripCorridor({
    plan,
    placeStations,
    packStations,
    cumulativeKm: 0,
    maxStations: 3,
  });
  const next = corridor.stations[0];
  if (!next) return undefined;

  return {
    placeId: next.id,
    placeNameZh: next.nameZh,
    distanceKm: next.distanceKm,
    durationMin: durationMinFromKm(next.distanceKm),
    lat: next.lat,
    lng: next.lng,
    kind: 'fuel',
  };
}

/**
 * 下一安全停车点：优先 curated safe-stop，再退 Place 停车点；永不编造 POI 名。
 */
export async function resolveNextSafeParking(
  prisma: CorridorPrisma,
  opts: {
    lat?: number;
    lng?: number;
    roadId?: string;
    requireToilet?: boolean;
  },
): Promise<CorridorPoiHit | undefined> {
  const db = prisma as PrismaTripLike;
  const hasCoords =
    typeof opts.lat === 'number' &&
    typeof opts.lng === 'number' &&
    Number.isFinite(opts.lat) &&
    Number.isFinite(opts.lng);

  try {
    const hit = resolveIcelandSafeStop({
      roadId: opts.roadId,
      lat: opts.lat,
      lng: opts.lng,
      corridorTags: ['ring_road', 'south'],
      maxDistanceKm: 80,
    });
    if (hit && (!opts.requireToilet || hit.stop.amenities.includes('TOILET'))) {
      const km = hit.distanceKm ?? 0;
      return {
        placeId: hit.stop.poiId,
        placeNameZh: hit.stop.name || hit.stop.poiId,
        distanceKm: Math.round(km * 10) / 10,
        durationMin: durationMinFromKm(km || 5),
        lat: hit.stop.lat,
        lng: hit.stop.lng,
        kind: hit.stop.amenities.includes('TOILET') ? 'toilet' : 'safe_parking',
      };
    }
  } catch {
    // catalog optional
  }

  if (!hasCoords) return undefined;

  try {
    const rows = await loadIcelandParkingNearPoint(db, {
      lat: opts.lat!,
      lng: opts.lng!,
      radiusKm: 80,
      limit: 20,
    });
    const best = rows[0];
    if (!best) return undefined;
    const km = haversineKm(opts.lat!, opts.lng!, best.lat, best.lng);
    return {
      placeId: `place-parking-${best.id}`,
      placeNameZh: best.nameCN?.trim() || best.nameEN?.trim() || `停车点 #${best.id}`,
      distanceKm: Math.round(km * 10) / 10,
      durationMin: durationMinFromKm(km),
      lat: best.lat,
      lng: best.lng,
      kind: opts.requireToilet ? 'toilet' : 'safe_parking',
    };
  } catch {
    return undefined;
  }
}

/** 厕所优先：先找带 TOILET 的 curated stop，再退停车。 */
export async function resolveNextToiletOrParking(
  prisma: CorridorPrisma,
  opts: { lat?: number; lng?: number; roadId?: string },
): Promise<CorridorPoiHit | undefined> {
  const toilet = await resolveNextSafeParking(prisma, {
    ...opts,
    requireToilet: true,
  });
  if (toilet) return { ...toilet, kind: 'toilet' };
  return resolveNextSafeParking(prisma, opts);
}

export function formatFuelTrailingZh(hit: CorridorPoiHit): string {
  return `${hit.durationMin} 分钟后 · ${Math.round(hit.distanceKm)} km`;
}

export function formatParkingTrailingZh(
  hit: CorridorPoiHit,
  restSuggested?: boolean,
): string {
  if (restSuggested) return `约 ${Math.round(hit.distanceKm)} km · 建议休息`;
  return `约 ${Math.round(hit.distanceKm)} km`;
}
