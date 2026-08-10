/**
 * 从 Trip 加载 TripDayWorldState → MDS day_conflict 提示（供 Activity 投影）。
 */

import {
  resolveTripDayWorldState,
} from '../../trips/utils/resolve-trip-day-world-state.util';
import { mapTripDayWorldConflictToMds, type MdsDayConflict } from './map-trip-day-world-conflict.util';

type PrismaDayConflictClient = {
  trip: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<{
      startDate: Date | string;
      metadata?: unknown;
      TripDay?: Array<{
        date: Date | string;
        ItineraryItem?: Array<{
          type?: string | null;
          note?: string | null;
          Place?: { nameCN?: string | null; nameEN?: string | null } | null;
        }>;
      }>;
    } | null>;
  };
};

function readDayThemes(metadata: unknown): Record<string, string> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).dayThemes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  );
}

export async function loadActivityDayConflictHint(input: {
  prisma: PrismaDayConflictClient;
  tripId?: string | null;
  focusDayIndex?: number | null;
  activityHint?: string | null;
}): Promise<MdsDayConflict | null> {
  const tripId = String(input.tripId ?? '').trim();
  const day = input.focusDayIndex;
  if (!tripId || day == null || !(Number(day) > 0)) return null;
  try {
    const trip = await input.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        startDate: true,
        metadata: true,
        TripDay: {
          orderBy: { date: 'asc' },
          select: {
            date: true,
            ItineraryItem: {
              select: {
                type: true,
                note: true,
                Place: { select: { nameCN: true, nameEN: true } },
              },
            },
          },
        },
      },
    });
    if (!trip?.TripDay?.length) return null;
    const resolution = resolveTripDayWorldState({
      requestedDay: Number(day),
      startDate: trip.startDate,
      days: trip.TripDay,
      dayThemes: readDayThemes(trip.metadata),
      activityHint: input.activityHint,
    });
    return mapTripDayWorldConflictToMds(resolution.conflict, {
      matchedOtherDays: resolution.matchedActivityItems
        .filter((m) => m.dayNumber !== Number(day))
        .map((m) => m.dayNumber),
    });
  } catch {
    return null;
  }
}
