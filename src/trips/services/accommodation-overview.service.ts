import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripsService } from '../trips.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
import { TripFileService } from '../trip-files/services/trip-file.service';
import type {
  AccommodationOverviewResponseDto,
  AccommodationBookingDocumentDto,
} from '../dto/accommodation-overview.dto';
import {
  buildAccommodationNightCard,
  buildAccommodationReminders,
  computeAccommodationStats,
  computeTravelSummary,
  isAccommodationItem,
  parseAccommodationOverviewInclude,
  type AccommodationItemRow,
} from '../utils/accommodation-overview.util';

@Injectable()
export class AccommodationOverviewService {
  private readonly logger = new Logger(AccommodationOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly itineraryItems: ItineraryItemsService,
    @Optional() private readonly tripFiles?: TripFileService,
  ) {}

  async getAccommodationOverview(
    tripId: string,
    userId: string | undefined,
    query: { include?: string },
  ): Promise<AccommodationOverviewResponseDto> {
    const include = parseAccommodationOverviewInclude(query.include);
    await this.tripsService.findOne(tripId, userId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        TripDay: {
          orderBy: { date: 'asc' },
          select: { id: true, date: true },
        },
      },
    });

    if (!trip) {
      return {
        tripId,
        stats: {
          totalNights: 0,
          bookedCount: 0,
          needBookingCount: 0,
          missingDocumentCount: 0,
          checkoutDaysCount: 0,
        },
        nights: [],
        reminders: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const orderedDays = trip.TripDay.map((d, index) => ({
      id: d.id,
      date: d.date,
      dayNumber: index + 1,
    }));

    const dayIds = orderedDays.map((d) => d.id);
    const itemsByDayId = await this.itineraryItems.loadItemsGroupedByTripDayIds(tripId, dayIds);

    const accommodationRows: AccommodationItemRow[] = [];

    for (const day of orderedDays) {
      const timelineItems = await this.itineraryItems.buildTimelineDayItems(
        { id: day.id, date: day.date, tripId },
        orderedDays,
        itemsByDayId,
      );

      for (const item of timelineItems) {
        const row = this.toAccommodationRow(item, day);
        if (!isAccommodationItem(row)) continue;
        accommodationRows.push(row);
      }
    }

    const linkedFilesByItemId = include.has('files')
      ? await this.loadLinkedTripFiles(tripId, userId, accommodationRows.map((r) => r.id))
      : new Map<string, { ids: string[]; docs: AccommodationBookingDocumentDto[] }>();

    const nights = include.has('nights')
      ? accommodationRows.map((row) => {
          const linked = linkedFilesByItemId.get(row.id) ?? { ids: [], docs: [] };
          return buildAccommodationNightCard(row, linked.ids, linked.docs);
        })
      : [];

    const stats = include.has('stats')
      ? computeAccommodationStats(nights)
      : {
          totalNights: 0,
          bookedCount: 0,
          needBookingCount: 0,
          missingDocumentCount: 0,
          checkoutDaysCount: 0,
        };

    const reminders = include.has('reminders') ? buildAccommodationReminders(nights) : [];

    let travelSummary;
    if (include.has('travel') && nights.length > 0) {
      try {
        await this.itineraryItems.getTripTravelInfoFromCache(tripId);
      } catch (e) {
        this.logger.debug(`travel-info cache unavailable for ${tripId}: ${e}`);
      }
      travelSummary = computeTravelSummary(nights);
    }

    return {
      tripId,
      stats,
      nights,
      reminders,
      ...(travelSummary ? { travelSummary } : {}),
      generatedAt: new Date().toISOString(),
    };
  }

  private toAccommodationRow(
    item: Record<string, unknown>,
    day: { id: string; date: Date; dayNumber: number },
  ): AccommodationItemRow {
    const place = item.Place as Record<string, unknown> | null | undefined;
    const crossDay = item.crossDayInfo as { isCheckoutItem?: boolean } | undefined;
    const placeMetadata =
      place?.metadata && typeof place.metadata === 'object'
        ? (place.metadata as Record<string, unknown>)
        : null;

    return {
      id: String(item.id),
      type: String(item.type ?? 'REST'),
      tripDayId: day.id,
      tripDayDate: day.date,
      dayNumber: day.dayNumber,
      startTime: item.startTime ? new Date(item.startTime as string | Date) : null,
      endTime: item.endTime ? new Date(item.endTime as string | Date) : null,
      bookingStatus: item.bookingStatus ? String(item.bookingStatus) : null,
      bookingConfirmation: item.bookingConfirmation ? String(item.bookingConfirmation) : null,
      bookingUrl: item.bookingUrl ? String(item.bookingUrl) : null,
      bookedAt: item.bookedAt ? new Date(item.bookedAt as string | Date) : null,
      costCategory: item.costCategory ? String(item.costCategory) : null,
      estimatedCost: typeof item.estimatedCost === 'number' ? item.estimatedCost : null,
      actualCost: typeof item.actualCost === 'number' ? item.actualCost : null,
      currency: item.currency ? String(item.currency) : null,
      note: item.note ? String(item.note) : null,
      placeId: typeof item.placeId === 'number' ? item.placeId : null,
      placeNameCN: place?.nameCN ? String(place.nameCN) : null,
      placeNameEN: place?.nameEN ? String(place.nameEN) : null,
      placeCategory: place?.category ? String(place.category) : null,
      placeAddress: place?.address ? String(place.address) : null,
      placeRating: typeof place?.rating === 'number' ? place.rating : null,
      placeMetadata,
      travelFromPreviousDuration:
        typeof item.travelFromPreviousDuration === 'number'
          ? item.travelFromPreviousDuration
          : null,
      travelFromPreviousDistance:
        typeof item.travelFromPreviousDistance === 'number'
          ? item.travelFromPreviousDistance
          : null,
      travelMode: item.travelMode ? String(item.travelMode) : null,
      isCheckoutItem:
        item._isCheckoutItem === true ||
        crossDay?.isCheckoutItem === true,
    };
  }

  private async loadLinkedTripFiles(
    tripId: string,
    userId: string | undefined,
    itemIds: string[],
  ): Promise<Map<string, { ids: string[]; docs: AccommodationBookingDocumentDto[] }>> {
    const result = new Map<string, { ids: string[]; docs: AccommodationBookingDocumentDto[] }>();
    if (!this.tripFiles || itemIds.length === 0) return result;

    try {
      const resolvedUserId = userId ?? 'anonymous-dev-user';
      const list = await this.tripFiles.listFiles(tripId, resolvedUserId, { limit: 200, offset: 0 });
      const itemIdSet = new Set(itemIds);

      for (const file of list.items) {
        if (!file.itineraryItemId || !itemIdSet.has(file.itineraryItemId)) continue;
        const bucket = result.get(file.itineraryItemId) ?? { ids: [], docs: [] };
        bucket.ids.push(file.id);
        if (file.status === 'UPLOADED') {
          bucket.docs.push({
            id: file.id,
            name: file.title ?? file.fileName ?? '附件',
            source: 'trip_file',
            mimeType: file.mimeType ?? undefined,
          });
        }
        result.set(file.itineraryItemId, bucket);
      }
    } catch (e) {
      this.logger.debug(`trip files unavailable for accommodation overview: ${e}`);
    }

    return result;
  }
}
