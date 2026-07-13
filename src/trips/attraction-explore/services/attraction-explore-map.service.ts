import { Injectable } from '@nestjs/common';
import { PlaceCategory } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AttractionExploreMapView } from '../types/attraction-explore.types';
import { parseCsvIds } from '../dto/attraction-explore.dto';
import { loadPlaceCoordinatesBatch } from '../utils/attraction-explore-place-coordinates.util';
import { AttractionExploreRouteDetourService } from './attraction-explore-route-detour.service';
import { PlanningLodgingWorkbenchService } from './planning-lodging-workbench.service';
import { resolveTripDayByIndex } from '../../utils/arrange-itinerary-day.util';

@Injectable()
export class AttractionExploreMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeDetour: AttractionExploreRouteDetourService,
    private readonly lodgingWorkbench: PlanningLodgingWorkbenchService,
  ) {}

  async getMap(input: {
    tripId: string;
    candidateIds?: string;
    viewTab?: string;
    dayIndex?: number;
    highlightItemId?: string;
    includeInsertHints?: boolean;
  }): Promise<AttractionExploreMapView> {
    const candidateIdFilter = new Set(parseCsvIds(input.candidateIds));

    const [candidateRows, itineraryPlaces, trip, tripDays] = await Promise.all([
      this.prisma.tripAttractionExploreCandidate.findMany({
        where: {
          tripId: input.tripId,
          ...(candidateIdFilter.size > 0 ? { id: { in: [...candidateIdFilter] } } : {}),
        },
        include: { Place: true },
        orderBy: { sortOrder: 'asc' },
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
      this.prisma.tripDay.findMany({
        where: { tripId: input.tripId },
        orderBy: { date: 'asc' },
        select: { id: true, date: true },
      }),
    ]);

    const selectedDayId =
      input.dayIndex != null && tripDays.length > 0
        ? resolveTripDayByIndex(tripDays, input.dayIndex).id
        : undefined;

    const filteredItineraryPlaces = selectedDayId
      ? itineraryPlaces.filter((item) => item.tripDayId === selectedDayId)
      : itineraryPlaces;

    const placeIds = [
      ...candidateRows.map((row) => row.placeId),
      ...filteredItineraryPlaces.map((item) => item.placeId!).filter(Boolean),
    ];
    const coordsMap = await loadPlaceCoordinatesBatch(this.prisma, placeIds);

    const hintRouteCoords = filteredItineraryPlaces
      .map((item) => (item.placeId ? coordsMap.get(item.placeId) : null))
      .filter((c): c is { lat: number; lng: number } => Boolean(c));

    const hintDayIndex =
      input.dayIndex ??
      (tripDays.length > 0 ? 1 : undefined);

    const pois: AttractionExploreMapView['pois'] = [];
    const seen = new Set<number>();
    const highlightCandidate = input.highlightItemId?.startsWith('candidate-')
      ? input.highlightItemId.replace(/^candidate-/, '')
      : undefined;
    const highlightRouteItem = input.highlightItemId?.startsWith('route-item-')
      ? input.highlightItemId.replace(/^route-item-/, '')
      : input.highlightItemId;

    const pushPoi = (entry: AttractionExploreMapView['pois'][number]) => {
      if (seen.has(entry.placeId)) return;
      seen.add(entry.placeId);
      pois.push(entry);
    };

    for (const row of candidateRows) {
      const coords = coordsMap.get(row.placeId);
      if (!coords) continue;

      let insertHint: AttractionExploreMapView['pois'][number]['insertHint'];
      if (input.includeInsertHints && hintRouteCoords.length > 0 && hintDayIndex != null) {
        const insertion = await this.routeDetour.findBestRouteInsertionAsync({
          routePoints: hintRouteCoords,
          candidate: coords,
          countryCode: trip.destination.toUpperCase(),
        });
        if (insertion) {
          insertHint = {
            suggestedDayIndex: hintDayIndex,
            detourMinutes: insertion.detourMinutes,
            detourMethod: insertion.method,
            startTime: '10:00',
          };
        }
      }

      pushPoi({
        id: `candidate-${row.id}`,
        placeId: row.placeId,
        name: row.Place.nameCN,
        coordinates: coords,
        kind: 'candidate',
        priority: row.priority as 'must_go' | 'very_interested' | 'alternative',
        highlighted: highlightCandidate === row.id || highlightRouteItem === row.id,
        insertHint,
      });
    }

    for (const item of filteredItineraryPlaces) {
      if (!item.Place || !item.placeId) continue;
      const coords = coordsMap.get(item.placeId);
      if (!coords) continue;
      pushPoi({
        id: `route-item-${item.id}`,
        placeId: item.placeId,
        name: item.Place.nameCN,
        coordinates: coords,
        kind: 'route',
        highlighted: highlightRouteItem === item.id,
      });
    }

    if (pois.length === 0 && input.viewTab === 'map') {
      const recommended = await this.prisma.place.findMany({
        where: {
          category: PlaceCategory.ATTRACTION,
          OR: [
            { City: { countryCode: trip.destination.toUpperCase() } },
            { metadata: { path: ['countryCode'], equals: trip.destination.toUpperCase() } },
          ],
        },
        orderBy: [{ rating: 'desc' }, { updatedAt: 'desc' }],
        take: 12,
      });
      const recCoords = await loadPlaceCoordinatesBatch(
        this.prisma,
        recommended.map((p) => p.id),
      );
      for (const place of recommended) {
        const coords = recCoords.get(place.id);
        if (!coords) continue;
        pushPoi({
          id: `recommendation-${place.id}`,
          placeId: place.id,
          name: place.nameCN,
          coordinates: coords,
          kind: 'recommendation',
        });
      }
    }

    const routePolyline =
      filteredItineraryPlaces
        .map((item) => (item.placeId ? coordsMap.get(item.placeId) : null))
        .filter((coords): coords is NonNullable<typeof coords> => Boolean(coords))
        .map((coords) => ({ lat: coords.lat, lng: coords.lng })) ?? [];

    const lodgingView = await this.lodgingWorkbench.buildView({
      tripId: input.tripId,
      dayIndex: input.dayIndex,
      highlightItemId: input.highlightItemId,
    });

    const allPois = [...pois, ...lodgingView.lodgingPois];
    const boundsCoords = [
      ...allPois.map((p) => p.coordinates),
      ...lodgingView.lodgingLegs.flatMap((leg) => [leg.from, leg.to]),
    ];

    return {
      tripId: input.tripId,
      routePolyline: routePolyline.length >= 2 ? routePolyline : null,
      pois: allPois,
      lodgingLegs: lodgingView.lodgingLegs,
      bounds: computeBounds(boundsCoords),
    };
  }
}

function computeBounds(
  coords: Array<{ lat: number; lng: number }>,
): AttractionExploreMapView['bounds'] {
  if (coords.length === 0) return null;
  let minLat = coords[0]!.lat;
  let maxLat = coords[0]!.lat;
  let minLng = coords[0]!.lng;
  let maxLng = coords[0]!.lng;
  for (const c of coords.slice(1)) {
    minLat = Math.min(minLat, c.lat);
    maxLat = Math.max(maxLat, c.lat);
    minLng = Math.min(minLng, c.lng);
    maxLng = Math.max(maxLng, c.lng);
  }
  return {
    northeast: { lat: maxLat, lng: maxLng },
    southwest: { lat: minLat, lng: minLng },
  };
}
