import type { PrismaService } from '../../../prisma/prisma.service';
import type { RoutePlanDraft, RouteSegment } from '../../decision/shared/world-model.types';
import {
  coordsFromPlaceMetadata,
  loadPlaceCoordinatesMap,
} from './split-plan-place-coords.util';
import {
  applyTerrainToSegmentPhysics,
  extractTerrainFromItemMetadata,
} from '../../dem/utils/map-travel-terrain.util';

type ItemRow = {
  id: string;
  placeId: number | null;
  travelFromPreviousDistance: number | null;
  travelFromPreviousDuration: number | null;
  trailId: number | null;
  metadata?: unknown;
  Trail: {
    distanceKm: number | null;
    elevationGainM: number | null;
    averageSlope: number | null;
  } | null;
  Place?: {
    id: number;
    metadata: unknown;
  } | null;
};

function resolveSegmentPhysics(item: ItemRow): {
  distanceKm: number;
  ascentM: number;
  slopePct: number;
  distanceSource: 'trail' | 'travelFromPrevious' | 'travel-eta-terrain' | 'none';
  terrain?: ReturnType<typeof extractTerrainFromItemMetadata>;
} {
  const terrain = extractTerrainFromItemMetadata(
    item.metadata ?? item.Place?.metadata,
  );
  if (item.Trail?.distanceKm != null && item.Trail.distanceKm > 0) {
    return {
      distanceKm: item.Trail.distanceKm,
      ascentM: item.Trail.elevationGainM ?? 0,
      slopePct: item.Trail.averageSlope ?? 0,
      distanceSource: 'trail',
      ...(terrain ? { terrain } : {}),
    };
  }
  if (terrain && item.travelFromPreviousDistance != null && item.travelFromPreviousDistance > 0) {
    const physics = applyTerrainToSegmentPhysics(terrain);
    return {
      distanceKm: item.travelFromPreviousDistance / 1000,
      ascentM: physics.ascentM,
      slopePct: physics.slopePct,
      distanceSource: 'travel-eta-terrain',
      terrain,
    };
  }
  if (item.travelFromPreviousDistance != null && item.travelFromPreviousDistance > 0) {
    return {
      distanceKm: item.travelFromPreviousDistance / 1000,
      ascentM: 0,
      slopePct: 0,
      distanceSource: 'travelFromPrevious',
      ...(terrain ? { terrain } : {}),
    };
  }
  return { distanceKm: 0, ascentM: 0, slopePct: 0, distanceSource: 'none', ...(terrain ? { terrain } : {}) };
}

/**
 * 从持久化 Trip 合成最小 RoutePlanDraft，供 Monte Carlo / 三人格等决策链使用。
 * 优先使用 Trail 距离/爬升；其次 travelFromPreviousDistance。
 */
export async function synthesizeRoutePlanDraftFromTrip(
  prisma: PrismaService,
  tripId: string,
): Promise<RoutePlanDraft | null> {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        destination: true,
        TripDay: {
          orderBy: { date: 'asc' },
          select: {
            id: true,
            date: true,
            ItineraryItem: {
              orderBy: { startTime: 'asc' },
              select: {
                id: true,
                placeId: true,
                travelFromPreviousDistance: true,
                travelFromPreviousDuration: true,
                trailId: true,
                Place: {
                  select: { id: true, metadata: true },
                },
                Trail: {
                  select: {
                    distanceKm: true,
                    elevationGainM: true,
                    averageSlope: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!trip) return null;

    const placeIds = (trip.TripDay ?? []).flatMap((day) =>
      (day.ItineraryItem ?? [])
        .map((item) => (item as ItemRow).placeId)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    );
    const coordMap = await loadPlaceCoordinatesMap(prisma, placeIds);

    const segments: RouteSegment[] = [];
    const days = trip.TripDay ?? [];
    if (days.length > 0) {
      days.forEach((day, dayIdx) => {
        const items = (day.ItineraryItem ?? []) as ItemRow[];
        if (items.length === 0) {
          segments.push({
            segmentId: `trip-${trip.id}-day-${dayIdx}-empty`,
            dayIndex: dayIdx,
            distanceKm: 0,
            ascentM: 0,
            slopePct: 0,
            metadata: { tripDayId: day.id, date: day.date.toISOString().slice(0, 10) },
          });
        } else {
          items.forEach((item, segIdx) => {
            const physics = resolveSegmentPhysics(item);
            const coords =
              (item.placeId != null ? coordMap.get(item.placeId) : undefined) ??
              coordsFromPlaceMetadata(item.Place?.metadata);
            segments.push({
              segmentId: `trip-${trip.id}-item-${item.id}`,
              dayIndex: dayIdx,
              distanceKm: physics.distanceKm,
              ascentM: physics.ascentM,
              slopePct: physics.slopePct,
              metadata: {
                itineraryItemId: item.id,
                tripDayIndex: dayIdx,
                segmentOrder: segIdx,
                distanceSource: physics.distanceSource,
                date: day.date.toISOString().slice(0, 10),
                ...(item.placeId != null ? { placeId: item.placeId } : {}),
                ...(coords
                  ? {
                      lat: coords.lat,
                      lng: coords.lng,
                      regionId: `day_${dayIdx}`,
                    }
                  : {}),
                ...(item.travelFromPreviousDuration != null
                  ? { travelFromPreviousDurationMin: item.travelFromPreviousDuration }
                  : {}),
                ...(physics.terrain
                  ? {
                      terrain: physics.terrain,
                      terrainAuditSource: 'travel-eta-terrain',
                      demSource: physics.terrain.demSource,
                    }
                  : {}),
              },
            });
          });
        }
      });
    }

    if (segments.length === 0) {
      segments.push({
        segmentId: `trip-${trip.id}-placeholder`,
        dayIndex: 0,
        distanceKm: 0,
        ascentM: 0,
        slopePct: 0,
        metadata: { synthetic: true, reason: 'no_trip_days' },
      });
    }

    const dest = (trip.destination || 'XX').trim().toUpperCase();
    return {
      tripId: trip.id,
      routeDirectionId: dest.length === 2 ? `synthetic-${dest}` : `synthetic-trip-${trip.id.slice(0, 8)}`,
      segments,
    };
  } catch {
    return null;
  }
}
