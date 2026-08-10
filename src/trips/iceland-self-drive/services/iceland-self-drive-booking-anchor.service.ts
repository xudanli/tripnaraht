import { Injectable, Logger } from '@nestjs/common';
import { ItemType, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import type { IcelandSelfDriveBookingDto } from '../dto/create-iceland-self-drive-trip.dto';
import type { IcelandSelfDriveHardAnchor } from '../types/iceland-self-drive.types';

@Injectable()
export class IcelandSelfDriveBookingAnchorService {
  private readonly logger = new Logger(IcelandSelfDriveBookingAnchorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedAnchors(
    tripId: string,
    bookings: IcelandSelfDriveBookingDto[],
  ): Promise<IcelandSelfDriveHardAnchor[]> {
    if (bookings.length === 0) return [];

    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
    });

    const dayByYmd = new Map<string, string>();
    for (const day of tripDays) {
      const ymd = DateTime.fromJSDate(day.date, { zone: 'utc' }).toISODate();
      if (ymd) dayByYmd.set(ymd, day.id);
    }

    const placeIds = [
      ...new Set(
        bookings
          .map((b) => b.placeId)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    const places =
      placeIds.length > 0
        ? await this.prisma.place.findMany({
            where: { id: { in: placeIds } },
            select: { id: true, nameCN: true, nameEN: true, address: true },
          })
        : [];
    const placeById = new Map(places.map((p) => [p.id, p]));

    const anchors: IcelandSelfDriveHardAnchor[] = [];
    const creates: Prisma.ItineraryItemCreateManyInput[] = [];

    for (const booking of bookings) {
      const tripDayId = dayByYmd.get(booking.startDate) ?? tripDays[0]?.id;
      if (!tripDayId) continue;

      const itemId = randomUUID();
      const startTime = this.resolveStartTime(booking);
      const endTime = this.resolveEndTime(booking, startTime);
      const place =
        booking.placeId != null ? placeById.get(booking.placeId) : undefined;
      const displayName =
        booking.name ||
        place?.nameCN ||
        place?.nameEN ||
        (booking.placeId != null ? `Place ${booking.placeId}` : '预订');

      creates.push({
        id: itemId,
        tripDayId,
        type: booking.kind === 'lodging' ? ItemType.REST : ItemType.ACTIVITY,
        placeId: place?.id ?? null,
        startTime,
        endTime,
        note: this.buildNote(booking, place?.id ?? null),
        bookingStatus: 'CONFIRMED',
        bookingConfirmation: displayName,
        order: booking.kind === 'lodging' ? 0 : 10,
      });

      anchors.push({
        itemId,
        clientId: booking.clientId,
        kind: booking.kind,
        placeId: place?.id ?? booking.placeId ?? null,
        regionId: booking.regionId ?? null,
      });
    }

    if (creates.length > 0) {
      await this.prisma.itineraryItem.createMany({ data: creates });
    }

    this.logger.log(
      `Seeded ${anchors.length} booking anchors on trip ${tripId} (withPlaceId=${anchors.filter((a) => a.placeId != null).length})`,
    );
    return anchors;
  }

  private buildNote(
    booking: IcelandSelfDriveBookingDto,
    placeId: number | null,
  ): string {
    const parts = [
      `[hard-anchor:${booking.kind}]`,
      placeId != null ? `placeId=${placeId}` : null,
      booking.regionId ? `regionId=${booking.regionId}` : null,
      booking.name,
      booking.locationText ? `@ ${booking.locationText}` : null,
      booking.cancellationPolicy ? `cancel=${booking.cancellationPolicy}` : null,
      booking.notes,
    ].filter(Boolean);
    return parts.join(' ');
  }

  private resolveStartTime(booking: IcelandSelfDriveBookingDto): Date {
    if (booking.startDateTime) {
      const dt = DateTime.fromISO(booking.startDateTime);
      if (dt.isValid) return dt.toJSDate();
    }
    const base = DateTime.fromISO(booking.startDate, { zone: 'utc' });
    const hour = booking.kind === 'lodging' ? 15 : 10;
    return base.set({ hour, minute: 0 }).toJSDate();
  }

  private resolveEndTime(
    booking: IcelandSelfDriveBookingDto,
    startTime: Date,
  ): Date | null {
    if (booking.kind === 'lodging' && booking.endDate) {
      return DateTime.fromISO(booking.endDate, { zone: 'utc' })
        .set({ hour: 11, minute: 0 })
        .toJSDate();
    }
    if (booking.durationMinutes && booking.durationMinutes > 0) {
      return DateTime.fromJSDate(startTime)
        .plus({ minutes: booking.durationMinutes })
        .toJSDate();
    }
    return null;
  }
}
