import { Injectable } from '@nestjs/common';
import { PlaceCategory } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isAccommodationItem,
  parseAlternatives,
  parseItemMetadataFromNote,
  type AccommodationItemRow,
} from '../../utils/accommodation-overview.util';
import {
  haversineKm,
  loadPlaceCoordinatesBatch,
} from '../utils/attraction-explore-place-coordinates.util';
import type {
  AttractionExploreMapPoi,
  PlanningLodgingLeg,
  PlanningLodgingSuggestion,
} from '../types/attraction-explore.types';

const RECOMMENDED_PER_NIGHT = 3;
const HOTEL_SEARCH_RADIUS_KM = 80;
const AVG_DRIVE_KMH = 50;

export interface PlanningLodgingWorkbenchView {
  suggestions: PlanningLodgingSuggestion[];
  lodgingPois: AttractionExploreMapPoi[];
  lodgingLegs: PlanningLodgingLeg[];
}

@Injectable()
export class PlanningLodgingWorkbenchService {
  constructor(private readonly prisma: PrismaService) {}

  async buildView(input: {
    tripId: string;
    dayIndex?: number;
    highlightItemId?: string;
  }): Promise<PlanningLodgingWorkbenchView> {
    const [tripDays, itineraryPlaces, trip] = await Promise.all([
      this.prisma.tripDay.findMany({
        where: { tripId: input.tripId },
        orderBy: { date: 'asc' },
        select: { id: true, date: true },
      }),
      this.prisma.itineraryItem.findMany({
        where: {
          TripDay: { tripId: input.tripId },
          placeId: { not: null },
        },
        include: { Place: true, TripDay: true },
        orderBy: [{ TripDay: { date: 'asc' } }, { order: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.trip.findUniqueOrThrow({
        where: { id: input.tripId },
        select: { destination: true },
      }),
    ]);

    const highlightSuggestionId = input.highlightItemId?.startsWith('lodging-')
      ? input.highlightItemId
      : undefined;

    const nightContexts = tripDays
      .map((day, index) => ({
        day,
        dayIndex: index + 1,
        nightIndex: index + 1,
      }))
      .filter((ctx) => ctx.nightIndex < tripDays.length);

    const filteredNights =
      input.dayIndex != null
        ? nightContexts.filter((ctx) => ctx.dayIndex === input.dayIndex)
        : nightContexts;

    const placeIds = [
      ...itineraryPlaces.map((item) => item.placeId!).filter(Boolean),
    ];
    const coordsMap = await loadPlaceCoordinatesBatch(this.prisma, placeIds);

    const hotelCatalog = await this.prisma.place.findMany({
      where: {
        category: PlaceCategory.HOTEL,
        OR: [
          { City: { countryCode: trip.destination.toUpperCase() } },
          { metadata: { path: ['countryCode'], equals: trip.destination.toUpperCase() } },
        ],
      },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        rating: true,
        metadata: true,
      },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'desc' }],
      take: 120,
    });
    const hotelCoordsMap = await loadPlaceCoordinatesBatch(
      this.prisma,
      hotelCatalog.map((place) => place.id),
    );

    const suggestions: PlanningLodgingSuggestion[] = [];
    const lodgingPois: AttractionExploreMapPoi[] = [];
    const lodgingLegs: PlanningLodgingLeg[] = [];
    const seenLodgingPlaceIds = new Set<number>();

    for (const ctx of filteredNights) {
      const dayItems = itineraryPlaces.filter((item) => item.tripDayId === ctx.day.id);
      const accommodationRows = dayItems
        .map((item) => this.toAccommodationRow(item, ctx.dayIndex))
        .filter(isAccommodationItem);

      const anchor = this.resolveDayAnchor(dayItems, coordsMap);
      const nightSuggestions: PlanningLodgingSuggestion[] = [];

      for (const row of accommodationRows) {
        const coords = row.placeId ? coordsMap.get(row.placeId) : null;
        if (!row.placeId || !coords) continue;
        nightSuggestions.push(
          this.buildSuggestion({
            id: `lodging-current-${row.id}`,
            nightIndex: ctx.nightIndex,
            dayIndex: ctx.dayIndex,
            placeId: row.placeId,
            name: row.placeNameCN ?? row.placeNameEN ?? '住宿',
            nameEN: row.placeNameEN,
            kind: 'current',
            priority: 'primary',
            coordinates: coords,
            rating: row.placeRating,
            region: null,
            reason: '当前行程住宿',
            itineraryItemId: row.id,
            anchor,
            highlighted: highlightSuggestionId === `lodging-current-${row.id}`,
          }),
        );

        const meta = parseItemMetadataFromNote(row.note);
        for (const alt of parseAlternatives(meta)) {
          if (!alt.placeId) continue;
          const altCoords = hotelCoordsMap.get(alt.placeId) ?? coordsMap.get(alt.placeId);
          if (!altCoords) continue;
          nightSuggestions.push(
            this.buildSuggestion({
              id: `lodging-alt-${row.id}-${alt.id}`,
              nightIndex: ctx.nightIndex,
              dayIndex: ctx.dayIndex,
              placeId: alt.placeId,
              name: alt.name,
              kind: 'alternative',
              priority: 'alternative',
              coordinates: altCoords,
              priceHint: alt.priceHint,
              reason: '备选住宿',
              anchor,
              highlighted: highlightSuggestionId === `lodging-alt-${row.id}-${alt.id}`,
            }),
          );
        }
      }

      const usedPlaceIds = new Set(nightSuggestions.map((s) => s.placeId));
      if (anchor?.coords) {
        const rankedHotels = hotelCatalog
          .map((place) => {
            const coords = hotelCoordsMap.get(place.id);
            if (!coords) return null;
            const distanceKm = haversineKm(
              anchor.coords.lat,
              anchor.coords.lng,
              coords.lat,
              coords.lng,
            );
            return { place, coords, distanceKm };
          })
          .filter(
            (entry): entry is NonNullable<typeof entry> =>
              entry != null && entry.distanceKm <= HOTEL_SEARCH_RADIUS_KM,
          )
          .sort((a, b) => {
            const ratingDiff = (b.place.rating ?? 0) - (a.place.rating ?? 0);
            if (Math.abs(ratingDiff) > 0.2) return ratingDiff;
            return a.distanceKm - b.distanceKm;
          });

        for (const entry of rankedHotels) {
          if (usedPlaceIds.has(entry.place.id)) continue;
          if (nightSuggestions.filter((s) => s.kind === 'recommended').length >= RECOMMENDED_PER_NIGHT) {
            break;
          }
          const suggestionId = `lodging-rec-${ctx.nightIndex}-${entry.place.id}`;
          nightSuggestions.push(
            this.buildSuggestion({
              id: suggestionId,
              nightIndex: ctx.nightIndex,
              dayIndex: ctx.dayIndex,
              placeId: entry.place.id,
              name: entry.place.nameCN,
              nameEN: entry.place.nameEN,
              kind: 'recommended',
              priority: 'recommended',
              coordinates: entry.coords,
              rating: entry.place.rating,
              region: extractPlaceRegion(entry.place.metadata),
              reason:
                anchor.label != null
                  ? `距 ${anchor.label} 约 ${entry.distanceKm.toFixed(1)} km`
                  : `距当日末站约 ${entry.distanceKm.toFixed(1)} km`,
              anchor,
              highlighted: highlightSuggestionId === suggestionId,
            }),
          );
          usedPlaceIds.add(entry.place.id);
        }
      }

      suggestions.push(...nightSuggestions);

      for (const suggestion of nightSuggestions) {
        if (!suggestion.coordinates) continue;
        if (seenLodgingPlaceIds.has(suggestion.placeId)) continue;
        seenLodgingPlaceIds.add(suggestion.placeId);

        lodgingPois.push({
          id: suggestion.id,
          placeId: suggestion.placeId,
          name: suggestion.name,
          coordinates: suggestion.coordinates,
          kind: suggestion.kind === 'current' ? 'lodging' : 'lodging_suggestion',
          highlighted: suggestion.highlighted,
          lodgingNightIndex: suggestion.nightIndex,
          lodgingDayIndex: suggestion.dayIndex,
        });
      }

      if (anchor?.coords) {
        for (const suggestion of nightSuggestions) {
          if (!suggestion.coordinates) continue;
          const distanceKm = suggestion.meta?.distanceFromAnchorKm;
          lodgingLegs.push({
            id: `lodging-leg-${ctx.nightIndex}-${suggestion.placeId}`,
            nightIndex: ctx.nightIndex,
            dayIndex: ctx.dayIndex,
            from: {
              lat: anchor.coords.lat,
              lng: anchor.coords.lng,
              placeId: anchor.placeId,
              label: anchor.label,
              kind: 'day_anchor',
            },
            to: {
              lat: suggestion.coordinates.lat,
              lng: suggestion.coordinates.lng,
              placeId: suggestion.placeId,
              label: suggestion.name,
              kind: suggestion.kind === 'current' ? 'lodging' : 'suggested_lodging',
            },
            distanceKm,
            driveMinutesEstimate: suggestion.meta?.driveMinutesEstimate,
            kind: suggestion.kind === 'current' ? 'approach' : 'relocation',
            highlighted: suggestion.highlighted,
          });
        }
      }
    }

    return { suggestions, lodgingPois, lodgingLegs };
  }

  private buildSuggestion(input: {
    id: string;
    nightIndex: number;
    dayIndex: number;
    placeId: number;
    name: string;
    nameEN?: string | null;
    kind: PlanningLodgingSuggestion['kind'];
    priority: PlanningLodgingSuggestion['priority'];
    coordinates: { lat: number; lng: number };
    rating?: number | null;
    priceHint?: string | null;
    region?: string | null;
    reason?: string;
    itineraryItemId?: string;
    anchor?: DayAnchor | null;
    highlighted?: boolean;
  }): PlanningLodgingSuggestion {
    const distanceFromAnchorKm =
      input.anchor?.coords != null
        ? haversineKm(
            input.anchor.coords.lat,
            input.anchor.coords.lng,
            input.coordinates.lat,
            input.coordinates.lng,
          )
        : undefined;

    return {
      id: input.id,
      nightIndex: input.nightIndex,
      dayIndex: input.dayIndex,
      placeId: input.placeId,
      name: input.name,
      nameEN: input.nameEN,
      kind: input.kind,
      priority: input.priority,
      coordinates: input.coordinates,
      rating: input.rating,
      priceHint: input.priceHint,
      region: input.region,
      reason: input.reason,
      itineraryItemId: input.itineraryItemId,
      highlighted: input.highlighted,
      meta: {
        distanceFromAnchorKm,
        anchorPlaceName: input.anchor?.label,
        driveMinutesEstimate:
          distanceFromAnchorKm != null
            ? Math.max(1, Math.round((distanceFromAnchorKm / AVG_DRIVE_KMH) * 60))
            : undefined,
      },
    };
  }

  private resolveDayAnchor(
    dayItems: Array<{
      id: string;
      placeId: number | null;
      note: string | null;
      type: string;
      Place: { nameCN: string; category: string } | null;
    }>,
    coordsMap: Map<number, { lat: number; lng: number }>,
  ): DayAnchor | null {
    const activityItems = dayItems.filter((item) => {
      if (!item.placeId || !item.Place) return false;
      const row = this.toAccommodationRow(item, 1);
      return !isAccommodationItem(row);
    });

    for (let i = activityItems.length - 1; i >= 0; i -= 1) {
      const item = activityItems[i]!;
      const coords = coordsMap.get(item.placeId!);
      if (!coords) continue;
      return {
        placeId: item.placeId!,
        label: item.Place!.nameCN,
        coords,
      };
    }

    return null;
  }

  private toAccommodationRow(
    item: {
      id: string;
      type: string;
      placeId: number | null;
      note: string | null;
      Place: {
        nameCN: string;
        nameEN?: string | null;
        category: string;
        rating?: number | null;
      } | null;
    },
    dayNumber: number,
  ): AccommodationItemRow {
    return {
      id: item.id,
      type: item.type,
      tripDayId: '',
      tripDayDate: new Date(),
      dayNumber,
      startTime: null,
      endTime: null,
      bookingStatus: null,
      bookingConfirmation: null,
      bookingUrl: null,
      bookedAt: null,
      costCategory: null,
      estimatedCost: null,
      actualCost: null,
      currency: null,
      note: item.note,
      placeId: item.placeId,
      placeNameCN: item.Place?.nameCN ?? null,
      placeNameEN: item.Place?.nameEN ?? null,
      placeCategory: item.Place?.category ?? null,
      placeAddress: null,
      placeRating: item.Place?.rating ?? null,
      placeMetadata: null,
      travelFromPreviousDuration: null,
      travelFromPreviousDistance: null,
      travelMode: null,
    };
  }
}

type DayAnchor = {
  placeId: number;
  label: string;
  coords: { lat: number; lng: number };
};

function extractPlaceRegion(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const region = (metadata as Record<string, unknown>).region;
  return typeof region === 'string' && region.trim() ? region.trim() : null;
}
