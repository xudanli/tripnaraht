/**
 * Trip-less Iceland bookable places catalog (lodging / activity).
 * Same Place rows as planning attraction-explore / lodging workbench.
 */

import { Injectable } from '@nestjs/common';
import { PlaceCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { loadPlaceCoordinatesBatch } from '../../attraction-explore/utils/attraction-explore-place-coordinates.util';
import { extractPlaceImageUrl } from '../../attraction-explore/utils/attraction-explore-place.util';
import {
  ICELAND_SELF_DRIVE_BOOKING_KINDS,
  ICELAND_SELF_DRIVE_REGION_IDS,
  type IcelandSelfDriveBookingKind,
  type IcelandSelfDriveRegionId,
} from '../dto/iceland-self-drive-enums';
import {
  placeRegionKeyToRegionId,
  REGION_ID_TO_PLACE_REGION_KEY,
} from '../dictionaries/iceland-self-drive.dictionaries';
import { isGoldenSetLodgingPlaceId } from '../utils/iceland-lodging-anchor-assessment.util';
import {
  resolveLodgingBookingLink,
  type LodgingBookingChannel,
  type LodgingBookingProvider,
} from '../../utils/lodging-booking-link.util';

export interface IcelandSelfDriveBookablePlaceItem {
  placeId: number;
  kind: IcelandSelfDriveBookingKind;
  nameZh: string;
  nameEn: string | null;
  locationText: string | null;
  regionId: IcelandSelfDriveRegionId | null;
  regionKey: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  /** From Place.metadata (imageUrl / images[]); null if catalog has no cover */
  imageUrl: string | null;
  /**
   * Lodging only: whether this placeId is Golden Set LODGING and thus accepted
   * as overnight endAnchor. Non–Golden Set hotels may still be listed but will
   * be rejected / blocked by lodging-anchor verification if confirmed.
   * Activity rows are always false.
   */
  anchorEligible: boolean;
  /** Primary CTA URL (official if known, else Booking.com). */
  bookingUrl: string | null;
  bookingProvider: LodgingBookingProvider | null;
  bookingCtaLabelZh: string | null;
  /** Multi-channel: Booking / Airbnb / Trip.com (+ official when known). */
  bookingLinks: LodgingBookingChannel[];
}

const IS_SCOPE: Prisma.PlaceWhereInput = {
  OR: [
    { City: { countryCode: 'IS' } },
    { metadata: { path: ['countryCode'], equals: 'IS' } },
  ],
};

@Injectable()
export class IcelandSelfDriveBookablePlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async search(input: {
    kind: IcelandSelfDriveBookingKind;
    q?: string;
    regionIds?: string[];
    limit?: number;
  }): Promise<{ items: IcelandSelfDriveBookablePlaceItem[] }> {
    const kind = input.kind;
    if (!(ICELAND_SELF_DRIVE_BOOKING_KINDS as readonly string[]).includes(kind)) {
      return { items: [] };
    }

    const take = Math.max(1, Math.min(input.limit ?? 40, 80));
    const regionKeys = this.resolveRegionKeys(input.regionIds);
    const q = input.q?.trim();

    const where: Prisma.PlaceWhereInput = {
      AND: [
        IS_SCOPE,
        kind === 'lodging'
          ? { category: PlaceCategory.HOTEL }
          : { category: { in: [PlaceCategory.ATTRACTION, PlaceCategory.SUPPLY] } },
        ...(regionKeys.length > 0
          ? [
              {
                OR: regionKeys.map((key) => ({
                  metadata: { path: ['regionKey'], equals: key },
                })),
              } as Prisma.PlaceWhereInput,
            ]
          : []),
        ...(q
          ? [
              {
                OR: [
                  { nameCN: { contains: q, mode: 'insensitive' } },
                  { nameEN: { contains: q, mode: 'insensitive' } },
                  { address: { contains: q, mode: 'insensitive' } },
                ],
              } as Prisma.PlaceWhereInput,
            ]
          : []),
      ],
    };

    const rows = await this.prisma.place.findMany({
      where,
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        address: true,
        rating: true,
        metadata: true,
        City: { select: { name: true, nameEN: true } },
      },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'desc' }],
      take,
    });

    const coords = await loadPlaceCoordinatesBatch(
      this.prisma,
      rows.map((r) => r.id),
    );

    const items: IcelandSelfDriveBookablePlaceItem[] = rows.map((row) => {
      const meta = (row.metadata as Record<string, unknown> | null) ?? {};
      const regionKey =
        typeof meta.regionKey === 'string' ? meta.regionKey : null;
      const regionId = placeRegionKeyToRegionId(regionKey);
      const cityLabel = row.City?.nameEN || row.City?.name || null;
      const locationText =
        row.address?.trim() ||
        (typeof meta.regionName === 'string' ? meta.regionName : null) ||
        cityLabel;
      const c = coords.get(row.id);
      const booking =
        kind === 'lodging'
          ? resolveLodgingBookingLink({
              nameZh: row.nameCN,
              nameEn: row.nameEN,
              metadata: meta,
              countryName: 'Iceland',
            })
          : null;

      return {
        placeId: row.id,
        kind,
        nameZh: row.nameCN || row.nameEN || `Place ${row.id}`,
        nameEn: row.nameEN ?? null,
        locationText,
        regionId,
        regionKey,
        lat: c?.lat ?? null,
        lng: c?.lng ?? null,
        rating: typeof row.rating === 'number' ? row.rating : null,
        imageUrl: extractPlaceImageUrl(meta),
        anchorEligible:
          kind === 'lodging' ? isGoldenSetLodgingPlaceId(row.id) : false,
        bookingUrl: booking?.bookingUrl ?? null,
        bookingProvider: booking?.bookingProvider ?? null,
        bookingCtaLabelZh: booking?.bookingCtaLabelZh ?? null,
        bookingLinks: booking?.bookingLinks ?? [],
      };
    });

    return { items };
  }

  private resolveRegionKeys(regionIds?: string[]): string[] {
    if (!regionIds?.length) return [];
    const keys = new Set<string>();
    for (const raw of regionIds) {
      const id = raw.trim() as IcelandSelfDriveRegionId;
      if (!(ICELAND_SELF_DRIVE_REGION_IDS as readonly string[]).includes(id)) {
        continue;
      }
      const key = REGION_ID_TO_PLACE_REGION_KEY[id];
      if (key) keys.add(key);
    }
    return [...keys];
  }
}
