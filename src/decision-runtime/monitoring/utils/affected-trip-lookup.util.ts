/**
 * Resolve trip IDs affected by realtime world changes (S3 monitoring auto-trigger).
 */

import type { PrismaService } from '../../../prisma/prisma.service';

export interface RealtimeChangeLike {
  type: 'ROAD_STATUS_CHANGE' | 'WEATHER_ALERT' | 'POI_STATUS_CHANGE';
  roadId?: string;
  dayIndex?: number;
}

export async function findTripsUsingRoad(
  prisma: PrismaService,
  roadId: string,
): Promise<Array<{ id: string }>> {
  const normalized = roadId.toUpperCase();
  const trips = await prisma.trip.findMany({
    where: { destination: 'IS' },
    select: { id: true, metadata: true },
    take: 500,
  });

  return trips.filter((trip) => {
    const bindings = (trip.metadata as Record<string, unknown> | null)
      ?.rfc001IcelandRoadBindings as { byItemId?: Record<string, string[]> } | undefined;
    if (!bindings?.byItemId) return false;
    return Object.values(bindings.byItemId).some(
      (roads) =>
        Array.isArray(roads) &&
        roads.some((r) => String(r).toUpperCase() === normalized),
    );
  });
}

/** MVP: weather alerts scan all Iceland trips with itinerary days. */
export async function findTripsForWeatherAlert(
  prisma: PrismaService,
): Promise<Array<{ id: string }>> {
  const trips = await prisma.trip.findMany({
    where: { destination: 'IS' },
    select: { id: true },
    take: 500,
  });
  return trips;
}

export async function detectAffectedTripIds(
  prisma: PrismaService,
  changes: RealtimeChangeLike[],
): Promise<string[]> {
  const affected: string[] = [];

  for (const change of changes) {
    if (change.type === 'ROAD_STATUS_CHANGE' && change.roadId) {
      const trips = await findTripsUsingRoad(prisma, change.roadId);
      affected.push(...trips.map((t) => t.id));
    }
    if (change.type === 'WEATHER_ALERT') {
      const trips = await findTripsForWeatherAlert(prisma);
      affected.push(...trips.map((t) => t.id));
    }
  }

  return Array.from(new Set(affected));
}
