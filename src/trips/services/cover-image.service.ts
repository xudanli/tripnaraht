import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  collectTripPoiImages,
  resolveTripCoverImageUrl,
} from '../utils/cover-image.util';

type TripCoverInput = {
  id: string;
  destination: string;
  metadata: unknown;
};

@Injectable()
export class CoverImageService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveCoverImagesForTrips(trips: TripCoverInput[]): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (trips.length === 0) return result;

    const tripIds = trips.map((trip) => trip.id);
    const destinationCodes = [...new Set(trips.map((trip) => trip.destination.toUpperCase()))];

    const [poiImagesByTrip, countryCoverByCode] = await Promise.all([
      this.loadPoiImagesByTripIds(tripIds),
      this.loadCountryCoverImages(destinationCodes),
    ]);

    for (const trip of trips) {
      const poiImages = poiImagesByTrip.get(trip.id) ?? [];
      const countryCover = countryCoverByCode.get(trip.destination.toUpperCase()) ?? null;
      result.set(
        trip.id,
        resolveTripCoverImageUrl(trip.id, trip.metadata, poiImages, countryCover),
      );
    }

    return result;
  }

  private async loadCountryCoverImages(codes: string[]): Promise<Map<string, string | null>> {
    const byCode = new Map<string, string | null>();
    if (codes.length === 0) return byCode;

    const profiles = await this.prisma.countryProfile.findMany({
      where: { isoCode: { in: codes } },
      select: { isoCode: true, coverImageUrl: true },
    });

    for (const code of codes) {
      byCode.set(code, null);
    }

    for (const profile of profiles) {
      const url =
        typeof profile.coverImageUrl === 'string' && profile.coverImageUrl.trim().length > 0
          ? profile.coverImageUrl.trim()
          : null;
      byCode.set(profile.isoCode.toUpperCase(), url);
    }

    return byCode;
  }

  private async loadPoiImagesByTripIds(tripIds: string[]): Promise<Map<string, string[]>> {
    const byTrip = new Map<string, string[]>();
    for (const tripId of tripIds) {
      byTrip.set(tripId, []);
    }

    const items = await this.prisma.itineraryItem.findMany({
      where: {
        placeId: { not: null },
        TripDay: { tripId: { in: tripIds } },
      },
      select: {
        order: true,
        Place: { select: { metadata: true } },
        TripDay: { select: { tripId: true, date: true } },
      },
      orderBy: [{ TripDay: { date: 'asc' } }, { order: 'asc' }],
    });

    const placeMetadatasByTrip = new Map<string, unknown[]>();
    for (const tripId of tripIds) {
      placeMetadatasByTrip.set(tripId, []);
    }

    for (const item of items) {
      const tripId = item.TripDay.tripId;
      const bucket = placeMetadatasByTrip.get(tripId);
      if (bucket) {
        bucket.push(item.Place?.metadata ?? null);
      }
    }

    for (const [tripId, metadatas] of placeMetadatasByTrip) {
      byTrip.set(tripId, collectTripPoiImages(metadatas));
    }

    return byTrip;
  }
}
