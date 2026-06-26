import type { PrismaService } from '../../../prisma/prisma.service';
import type { RoutePlanDraft, RouteSegment } from '../../decision/shared/world-model.types';

type ItemRow = {
  id: string;
  travelFromPreviousDistance: number | null;
  travelFromPreviousDuration: number | null;
  trailId: number | null;
  Trail: {
    distanceKm: number | null;
    elevationGainM: number | null;
    averageSlope: number | null;
  } | null;
};

function resolveSegmentPhysics(item: ItemRow): {
  distanceKm: number;
  ascentM: number;
  slopePct: number;
  distanceSource: 'trail' | 'travelFromPrevious' | 'none';
} {
  if (item.Trail?.distanceKm != null && item.Trail.distanceKm > 0) {
    return {
      distanceKm: item.Trail.distanceKm,
      ascentM: item.Trail.elevationGainM ?? 0,
      slopePct: item.Trail.averageSlope ?? 0,
      distanceSource: 'trail',
    };
  }
  if (item.travelFromPreviousDistance != null && item.travelFromPreviousDistance > 0) {
    return {
      distanceKm: item.travelFromPreviousDistance / 1000,
      ascentM: 0,
      slopePct: 0,
      distanceSource: 'travelFromPrevious',
    };
  }
  return { distanceKm: 0, ascentM: 0, slopePct: 0, distanceSource: 'none' };
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
                travelFromPreviousDistance: true,
                travelFromPreviousDuration: true,
                trailId: true,
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
                ...(item.travelFromPreviousDuration != null
                  ? { travelFromPreviousDurationMin: item.travelFromPreviousDuration }
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
