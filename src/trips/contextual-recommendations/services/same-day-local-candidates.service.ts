import { Injectable } from '@nestjs/common';
import { PlaceCategory } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { haversineDistanceKm } from '../../../transport/utils/geo-distance.util';
import { resolvePlaceCoordinates } from '../../../places/utils/place-coordinates.util';
import type { SameDayLocalCandidate } from '../types/contextual-recommendations.types';

const LIGHT_ACTIVITY_NAME_HINTS = [
  'Sun Voyager',
  '太阳航海者',
  'Sólfar',
  'Solfar',
  'Harpa',
  '哈帕',
];

@Injectable()
export class SameDayLocalCandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  async loadNearHotel(input: {
    countryCode: string;
    hotel: {
      lat?: number | null;
      lng?: number | null;
      cityName?: string | null;
      name?: string | null;
    } | null;
    radiusKm?: number;
  }): Promise<SameDayLocalCandidate[]> {
    const hotel = input.hotel;
    if (!hotel?.lat || !hotel?.lng || !Number.isFinite(hotel.lat) || !Number.isFinite(hotel.lng)) {
      return this.loadByNameHints(input.countryCode);
    }

    const country = input.countryCode.toUpperCase().slice(0, 2);
    const radiusKm = input.radiusKm ?? 3.5;

    const places = await this.prisma.place.findMany({
      where: {
        OR: [
          { City: { countryCode: country } },
          { metadata: { path: ['countryCode'], equals: country } },
        ],
        category: { in: [PlaceCategory.RESTAURANT, PlaceCategory.ATTRACTION] },
      },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
        rating: true,
        metadata: true,
        City: { select: { nameCN: true, name: true, nameEN: true } },
      },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'desc' }],
      take: 80,
    });

    const dining: SameDayLocalCandidate[] = [];
    const activities: SameDayLocalCandidate[] = [];

    for (const place of places) {
      const coords = resolvePlaceCoordinates(place as never);
      if (!coords) continue;
      const distanceKm = haversineDistanceKm(
        { lat: hotel.lat, lng: hotel.lng },
        coords,
      );
      if (distanceKm > radiusKm) continue;

      const name = place.nameCN?.trim() || place.nameEN?.trim() || `Place ${place.id}`;
      if (place.category === PlaceCategory.RESTAURANT) {
        dining.push({
          placeId: place.id,
          name,
          kind: 'DINING',
          distanceKm: Number(distanceKm.toFixed(2)),
        });
      } else if (place.category === PlaceCategory.ATTRACTION) {
        const hay = `${place.nameCN ?? ''} ${place.nameEN ?? ''}`;
        const hintHit = LIGHT_ACTIVITY_NAME_HINTS.some((h) =>
          hay.toLowerCase().includes(h.toLowerCase()),
        );
        if (!hintHit && distanceKm > 1.8) continue;
        activities.push({
          placeId: place.id,
          name,
          kind: 'LIGHT_ACTIVITY',
          productId: hintHit
            ? /harpa|哈帕/i.test(hay)
              ? 'poi_harpa_waterfront'
              : 'poi_sun_voyager'
            : undefined,
          distanceKm: Number(distanceKm.toFixed(2)),
        });
      }
    }

    dining.sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
    activities.sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));

    return [...dining.slice(0, 3), ...activities.slice(0, 3)];
  }

  private async loadByNameHints(countryCode: string): Promise<SameDayLocalCandidate[]> {
    const country = countryCode.toUpperCase().slice(0, 2);
    const out: SameDayLocalCandidate[] = [];
    for (const hint of LIGHT_ACTIVITY_NAME_HINTS) {
      const place = await this.prisma.place.findFirst({
        where: {
          AND: [
            {
              OR: [
                { City: { countryCode: country } },
                { metadata: { path: ['countryCode'], equals: country } },
              ],
            },
            {
              OR: [
                { nameEN: { contains: hint, mode: 'insensitive' } },
                { nameCN: { contains: hint } },
              ],
            },
          ],
        },
        select: { id: true, nameCN: true, nameEN: true },
      });
      if (!place) continue;
      const name = place.nameCN?.trim() || place.nameEN?.trim() || hint;
      const productId = /harpa|哈帕/i.test(hint)
        ? 'poi_harpa_waterfront'
        : 'poi_sun_voyager';
      if (out.some((c) => c.placeId === place.id)) continue;
      out.push({ placeId: place.id, name, kind: 'LIGHT_ACTIVITY', productId });
      if (out.length >= 3) break;
    }
    return out;
  }
}
