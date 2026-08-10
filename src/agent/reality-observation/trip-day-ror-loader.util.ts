/**
 * 从 TripDay / ItineraryItem 装载 ROR 种子（P0 Trip loader）。
 */

import { resolvePlaceCoordinates } from '../../places/utils/place-coordinates.util';
import type { TripDaySeed, TripDaySeedActivity } from './observation-seed.builder';
import type { RorRouteLegInput } from './route-matrix-ror-loader';
import { resolveWeatherGeoForRor } from './ror-weather-geo.util';
import {
  extractVehicleFactsFromTripMetadata,
  isSelfDriveTripMetadata,
} from './vehicle-ror-loader.util';
import {
  extractExperienceFactsFromDayItems,
  type RorExperienceDefinitionLike,
} from './experience-ror-loader.util';
import { extractTeamFactsFromTripMeta } from './team-ror-loader.util';
import { deriveBookingFactsFromDayItems } from './booking-ror-loader.util';

export type RorTripDayPrisma = {
  tripDay: {
    findMany: (args: {
      where: { tripId: string };
      orderBy: { date: 'asc' };
      include: {
        ItineraryItem: {
          include: { Place: true; ExperienceDefinition?: true };
        };
      };
    }) => Promise<
      Array<{
        id: string;
        date: Date;
        ItineraryItem?: Array<{
          id: string;
          type?: string;
          note?: string | null;
          startTime?: Date | null;
          endTime?: Date | null;
          travelFromPreviousDuration?: number | null;
          bookingStatus?: string | null;
          Place?: {
            name?: string | null;
            nameCN?: string | null;
            nameEN?: string | null;
            metadata?: unknown;
            location?: unknown;
            lat?: number | null;
            lng?: number | null;
          } | null;
          ExperienceDefinition?: RorExperienceDefinitionLike | null;
        }>;
      }>
    >;
  };
  trip?: {
    findUnique: (args: {
      where: { id: string };
      select: {
        id: true;
        destination?: true;
        metadata?: true;
        startDate?: true;
        endDate?: true;
      };
    }) => Promise<{
      id: string;
      destination?: string | null;
      metadata?: unknown;
      startDate?: Date | null;
      endDate?: Date | null;
    } | null>;
  };
  tripCollaborator?: {
    count: (args: { where: { tripId: string } }) => Promise<number>;
  };
};

function durationMinutesFromItem(item: {
  startTime?: Date | null;
  endTime?: Date | null;
  travelFromPreviousDuration?: number | null;
}): number {
  if (item.startTime && item.endTime) {
    const ms = item.endTime.getTime() - item.startTime.getTime();
    if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 60000);
  }
  return 90;
}

function placeTitle(place: {
  name?: string | null;
  nameCN?: string | null;
  nameEN?: string | null;
} | null | undefined): string | null {
  return (
    place?.nameCN?.trim() ||
    place?.name?.trim() ||
    place?.nameEN?.trim() ||
    null
  );
}

/**
 * 按 1-based dayIndex 拉取当日活动 / 住宿 / 车辆 / 体验绑定。
 */
export async function loadTripDaySeedForRor(
  prisma: RorTripDayPrisma,
  tripId: string,
  dayIndex: number | null | undefined,
): Promise<TripDaySeed | null> {
  const tid = tripId?.trim();
  if (!tid) return null;

  const days = await prisma.tripDay.findMany({
    where: { tripId: tid },
    orderBy: { date: 'asc' },
    include: {
      ItineraryItem: {
        include: { Place: true, ExperienceDefinition: true },
      },
    },
  });
  if (!days.length) return null;

  const idx =
    dayIndex != null && dayIndex > 0 && dayIndex <= days.length ? dayIndex - 1 : 0;
  const day = days[idx];
  if (!day) return null;

  const activities: TripDaySeedActivity[] = [];
  const fixedBookings: Array<Record<string, unknown>> = [];
  let accommodation: unknown;
  const placeNames: string[] = [];
  const activityPoints: Array<{
    id: string;
    title: string;
    lat: number | null;
    lng: number | null;
    travelFromPreviousDuration: number | null;
  }> = [];
  const experienceItems: Array<{
    id: string;
    ExperienceDefinition?: RorExperienceDefinitionLike | null;
  }> = [];

  for (const item of day.ItineraryItem ?? []) {
    const type = String(item.type ?? '').toUpperCase();
    const title =
      placeTitle(item.Place) ||
      item.note?.trim() ||
      type ||
      item.id;
    const coords = resolvePlaceCoordinates(item.Place as any);
    if (placeTitle(item.Place)) placeNames.push(placeTitle(item.Place)!);

    if (item.ExperienceDefinition) {
      experienceItems.push({
        id: item.id,
        ExperienceDefinition: item.ExperienceDefinition,
      });
    }

    if (type.includes('REST') || type.includes('HOTEL') || type.includes('ACCOM')) {
      accommodation = {
        id: item.id,
        title,
        type,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      };
      continue;
    }
    activities.push({
      id: item.id,
      title: String(title).slice(0, 80),
      durationMinutes: durationMinutesFromItem(item),
      kind: type || undefined,
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    });
    activityPoints.push({
      id: item.id,
      title: String(title).slice(0, 80),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      travelFromPreviousDuration:
        item.travelFromPreviousDuration != null
          ? Number(item.travelFromPreviousDuration)
          : null,
    });
    if (
      item.bookingStatus &&
      /confirm|paid|booked|HOLD/i.test(item.bookingStatus)
    ) {
      fixedBookings.push({
        id: item.id,
        title,
        bookingStatus: item.bookingStatus,
      });
    }
  }

  let travelMode: 'SELF_DRIVE' | 'OTHER' | undefined;
  let destination: string | null = null;
  let vehicle: unknown;
  let vehicleDriveType: string | undefined;
  let vehicleRentalRestriction: unknown;
  let remainingDays: number | undefined;
  let participants: unknown;
  let teamMemberCapability: unknown;
  let bookingAvailability: unknown;

  try {
    const trip = await prisma.trip?.findUnique({
      where: { id: tid },
      select: {
        id: true,
        destination: true,
        metadata: true,
        startDate: true,
        endDate: true,
      },
    });
    destination = trip?.destination?.trim() || null;
    if (isSelfDriveTripMetadata(trip?.metadata, destination)) {
      travelMode = 'SELF_DRIVE';
    } else if (destination) {
      travelMode = 'OTHER';
    }

    const vehicleFacts = extractVehicleFactsFromTripMetadata(trip?.metadata);
    if (vehicleFacts) {
      vehicle = vehicleFacts['vehicle.profile'];
      vehicleDriveType = vehicleFacts['vehicle.driveType'];
      vehicleRentalRestriction = vehicleFacts['vehicle.rentalRestriction'];
      if (!travelMode) travelMode = 'SELF_DRIVE';
    }

    let collaboratorCount = 0;
    try {
      collaboratorCount = (await prisma.tripCollaborator?.count({
        where: { tripId: tid },
      })) ?? 0;
    } catch {
      collaboratorCount = 0;
    }

    const teamFacts = extractTeamFactsFromTripMeta({
      metadata: trip?.metadata,
      collaboratorCount,
    });
    participants = teamFacts.participants;
    teamMemberCapability = teamFacts['team.memberCapability'];

    remainingDays = Math.max(0, days.length - (idx + 1));
  } catch {
    /* optional */
  }

  const travelMinutes = (day.ItineraryItem ?? []).reduce(
    (s, it) => s + (Number(it.travelFromPreviousDuration) || 0),
    0,
  );

  const routeLegs: RorRouteLegInput[] = [];
  for (let i = 1; i < activityPoints.length; i++) {
    const prev = activityPoints[i - 1];
    const cur = activityPoints[i];
    routeLegs.push({
      from:
        prev.lat != null && prev.lng != null
          ? { lat: prev.lat, lng: prev.lng }
          : null,
      to:
        cur.lat != null && cur.lng != null
          ? { lat: cur.lat, lng: cur.lng }
          : null,
      fromLabel: prev.title,
      toLabel: cur.title,
      fallbackMinutes: cur.travelFromPreviousDuration,
    });
  }

  const coordsWithValues = activityPoints.filter(
    (p) => p.lat != null && p.lng != null,
  );
  const centroidLat =
    coordsWithValues.length > 0
      ? coordsWithValues.reduce((s, p) => s + (p.lat as number), 0) /
        coordsWithValues.length
      : null;
  const centroidLng =
    coordsWithValues.length > 0
      ? coordsWithValues.reduce((s, p) => s + (p.lng as number), 0) /
        coordsWithValues.length
      : null;

  const weatherGeo = resolveWeatherGeoForRor({
    destination,
    placeNames,
    latitudeDeg: centroidLat,
    longitudeDeg: centroidLng,
  });

  const experienceFacts = extractExperienceFactsFromDayItems(experienceItems);

  const bookingFacts = deriveBookingFactsFromDayItems(
    (day.ItineraryItem ?? []).map((item) => ({
      id: item.id,
      title:
        placeTitle(item.Place) ||
        item.note?.trim() ||
        String(item.type ?? '') ||
        item.id,
      bookingStatus: item.bookingStatus,
      type: item.type,
      ExperienceDefinition: item.ExperienceDefinition,
    })),
  );
  if (!fixedBookings.length && bookingFacts['booking.fixedCommitments'].length) {
    fixedBookings.push(...bookingFacts['booking.fixedCommitments']);
  }
  bookingAvailability = bookingFacts['booking.availability'];

  return {
    dayIndex: idx + 1,
    date: day.date.toISOString().slice(0, 10),
    activities,
    accommodation,
    travelMode,
    vehicle,
    vehicleDriveType,
    vehicleRentalRestriction,
    remainingDays,
    fixedBookings: fixedBookings.length ? fixedBookings : [],
    participants,
    teamMemberCapability,
    bookingAvailability,
    destinationHint: destination ?? undefined,
    weatherCityHint: weatherGeo.city,
    latitudeDeg: weatherGeo.latitudeDeg,
    longitudeDeg: weatherGeo.longitudeDeg,
    routeLegs: routeLegs.length ? routeLegs : undefined,
    experienceProduct: experienceFacts['experience.product'],
    experiencePhysicalIntensity: experienceFacts['experience.physicalIntensity'],
    ...(travelMinutes > 0 ? { travelMinutesHint: travelMinutes } : {}),
  };
}

/** @deprecated 使用 TripDaySeed.travelMinutesHint */
export async function loadTravelMinutesHintForRor(
  prisma: RorTripDayPrisma,
  tripId: string,
  dayIndex: number | null | undefined,
): Promise<number | null> {
  const seed = await loadTripDaySeedForRor(prisma, tripId, dayIndex);
  return seed?.travelMinutesHint ?? null;
}
