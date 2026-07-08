import { Injectable } from '@nestjs/common';
import { PlaceCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ATTRACTION_EXPLORE_RECOMMENDATION_GROUPS } from '../constants/attraction-explore-catalog.constants';
import { AttractionExploreIntentCompileService } from './attraction-explore-intent-compile.service';
import { AttractionExploreRouteDetourService } from './attraction-explore-route-detour.service';
import type {
  AttractionExploreRecommendationGroup,
  AttractionExploreRecommendationsView,
  AttractionExploreSearchView,
  AttractionExploreViewTab,
} from '../types/attraction-explore.types';
import {
  mergeCompiledIntentWithFilters,
} from '../utils/attraction-explore-intent-compiler.util';
import {
  EXPERIENCE_CATEGORY_LABELS,
  buildExperienceCoverage,
  experienceGapScore,
} from '../utils/attraction-explore-experience-coverage.util';
import {
  isCoreAttraction,
  isRainyDayFriendlyPlace,
  mapPlaceToRecommendationItem,
  matchesSuitability,
  matchesTheme,
  rainyDayFriendlyScore,
  resolvePlaceCoordsOrNull,
} from '../utils/attraction-explore-place.util';
import {
  estimateDetourMinutes,
  rankAttractionExplorePlaces,
  type AttractionExploreScoringContext,
} from '../utils/attraction-explore-scoring.util';

type PlaceRow = Prisma.PlaceGetPayload<{ include: { City: true } }>;

@Injectable()
export class AttractionExploreRecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intentCompile: AttractionExploreIntentCompileService,
    private readonly routeDetour: AttractionExploreRouteDetourService,
  ) {}

  async getRecommendations(input: {
    tripId: string;
    destination: string;
    themeIds?: string[];
    suitabilityIds?: string[];
    viewTab?: AttractionExploreViewTab;
    weatherHint?: string | null;
    useLiveRoutes?: boolean;
  }): Promise<AttractionExploreRecommendationsView> {
    const viewTab = input.viewTab ?? 'recommended';
    const places = await this.loadDestinationPlaces(input.destination, 120);
    const filtered = this.applyFilters(places, input.themeIds, input.suitabilityIds);
    const routeContext = await this.loadRouteContext(input.tripId, places);
    const scoringCtx: AttractionExploreScoringContext = {
      themeIds: input.themeIds,
      suitabilityIds: input.suitabilityIds,
      routePlaceIds: routeContext.routePlaceIds,
      scheduledPlaceIds: routeContext.scheduledPlaceIds,
      routeAnchors: routeContext.routeAnchors,
      experienceCoverage: routeContext.experienceCoverage,
      weatherHint: input.weatherHint ?? null,
      countryCode: input.destination.toUpperCase(),
    };

    const groups = await this.buildGroups(filtered, places, viewTab, scoringCtx, input.useLiveRoutes);
    return { tripId: input.tripId, viewTab, groups };
  }

  async search(input: {
    tripId: string;
    destination: string;
    query: string;
    themeIds?: string[];
    suitabilityIds?: string[];
    viewTab?: AttractionExploreViewTab;
    limit?: number;
    weatherHint?: string | null;
    useLiveRoutes?: boolean;
    useLlmIntent?: boolean;
  }): Promise<AttractionExploreSearchView> {
    const compiledIntent = await this.intentCompile.compile(input.query, {
      useLlm: input.useLlmIntent,
    });
    const merged = mergeCompiledIntentWithFilters({
      compiled: compiledIntent,
      themeIds: input.themeIds,
      suitabilityIds: input.suitabilityIds,
    });

    const countryCode = input.destination.toUpperCase();
    const q = input.query.trim();
    const places = await this.loadDestinationPlaces(countryCode, 160);

    let filtered = this.applyFilters(places, merged.themeIds, merged.suitabilityIds);

    if (compiledIntent.weatherMode === 'RAINY_DAY') {
      filtered = filtered.filter((p) => isRainyDayFriendlyPlace(p));
    }

    if (compiledIntent.excludeVisited) {
      const routeContext = await this.loadRouteContext(input.tripId, places);
      filtered = filtered.filter((p) => !routeContext.scheduledPlaceIds.has(p.id));
    }

    if (q) {
      const keywordHits = places.filter((p) => {
        const hay = `${p.nameCN} ${p.nameEN ?? ''} ${p.description ?? ''}`.toLowerCase();
        return (
          hay.includes(q.toLowerCase()) ||
          compiledIntent.keywords.some((k) => hay.includes(k.toLowerCase()))
        );
      });
      const mergedIds = new Set(filtered.map((p) => p.id));
      for (const place of keywordHits) {
        if (!mergedIds.has(place.id)) filtered.push(place);
      }
    }

    const routeContext = await this.loadRouteContext(input.tripId, places);
    const scoringCtx: AttractionExploreScoringContext = {
      themeIds: merged.themeIds,
      suitabilityIds: merged.suitabilityIds,
      routePlaceIds: routeContext.routePlaceIds,
      scheduledPlaceIds: routeContext.scheduledPlaceIds,
      routeAnchors: routeContext.routeAnchors,
      experienceCoverage: routeContext.experienceCoverage,
      weatherHint:
        compiledIntent.weatherMode === 'RAINY_DAY' ? 'rain' : (input.weatherHint ?? null),
      countryCode,
      maxDetourMinutes: compiledIntent.maxDetourMinutes,
    };

    const ranked = rankAttractionExplorePlaces(filtered, scoringCtx, input.limit ?? 20);

    const detourBatch =
      input.useLiveRoutes && routeContext.routeAnchors.length >= 2
        ? await this.routeDetour.estimateDetourMinutesBatch({
            places: ranked
              .map((r) => resolvePlaceCoordsOrNull(r.place))
              .filter((c): c is { lat: number; lng: number } => c != null),
            routeAnchors: routeContext.routeAnchors,
            countryCode,
            useLiveRoutes: true,
            limit: input.limit ?? 20,
          })
        : null;

    const items = ranked.map((row) => {
      const coords = resolvePlaceCoordsOrNull(row.place);
      const detourKey = coords ? `${coords.lat},${coords.lng}` : null;
      const liveDetour = detourKey && detourBatch ? detourBatch.get(detourKey) : null;
      const detourMinutes =
        liveDetour?.detourMinutes ??
        estimateDetourMinutes(row.place, routeContext.routeAnchors, countryCode) ??
        undefined;

      return mapPlaceToRecommendationItem(row.place, {
        score: Number(row.score.toFixed(2)),
        recommendationReasons: row.reasons,
        detourMinutes,
        detourMethod: liveDetour?.method,
      });
    });

    const viewTab = input.viewTab ?? merged.viewTab ?? 'recommended';

    return {
      tripId: input.tripId,
      viewTab,
      compiledIntent,
      groups: items.length
        ? [{ groupId: 'search_results', title: `「${input.query}」匹配结果`, items }]
        : [],
    };
  }

  private async loadDestinationPlaces(destination: string, take: number): Promise<PlaceRow[]> {
    return this.prisma.place.findMany({
      where: {
        category: PlaceCategory.ATTRACTION,
        OR: [
          { City: { countryCode: destination.toUpperCase() } },
          { metadata: { path: ['countryCode'], equals: destination.toUpperCase() } },
        ],
      },
      include: { City: true },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'desc' }],
      take,
    });
  }

  private applyFilters(
    places: PlaceRow[],
    themeIds?: string[],
    suitabilityIds?: string[],
  ): PlaceRow[] {
    return places.filter((place) => {
      const themeOk =
        !themeIds?.length || themeIds.some((themeId) => matchesTheme(place, themeId));
      const suitOk =
        !suitabilityIds?.length ||
        suitabilityIds.some((suitId) => matchesSuitability(place, suitId));
      return themeOk && suitOk;
    });
  }

  private async loadRouteContext(tripId: string, allPlaces: PlaceRow[]) {
    const items = await this.prisma.itineraryItem.findMany({
      where: {
        TripDay: { tripId },
        placeId: { not: null },
      },
      select: { placeId: true },
    });

    const routePlaceIds = new Set(items.map((i) => i.placeId!).filter(Boolean));
    const scheduledPlaceIds = new Set(routePlaceIds);
    const scheduledPlaces = allPlaces.filter((p) => scheduledPlaceIds.has(p.id));

    const routeAnchors = [...routePlaceIds]
      .map((id) => allPlaces.find((p) => p.id === id))
      .map((p) => (p ? resolvePlaceCoordsOrNull(p) : null))
      .filter((c): c is { lat: number; lng: number } => c != null);

    return {
      routePlaceIds,
      scheduledPlaceIds,
      routeAnchors,
      experienceCoverage: buildExperienceCoverage(scheduledPlaces),
    };
  }

  private async buildGroups(
    filteredPlaces: PlaceRow[],
    allPlaces: PlaceRow[],
    viewTab: AttractionExploreViewTab,
    scoringCtx: AttractionExploreScoringContext,
    useLiveRoutes?: boolean,
  ): Promise<AttractionExploreRecommendationGroup[]> {
    if (viewTab === 'map') {
      return [
        {
          groupId: 'map_highlights',
          title: '地图精选',
          items: filteredPlaces
            .filter((p) => resolvePlaceCoordsOrNull(p))
            .slice(0, 24)
            .map((p) => mapPlaceToRecommendationItem(p)),
        },
      ];
    }

    const ranked = rankAttractionExplorePlaces(filteredPlaces, scoringCtx, 24);

    const core = ranked
      .filter((row) => isCoreAttraction(row.place) || row.score >= 0.55)
      .slice(0, 8)
      .map((row, idx) =>
        mapPlaceToRecommendationItem(row.place, {
          badge: idx === 0 ? '人气 No.1' : null,
          score: Number(row.score.toFixed(2)),
          recommendationReasons: row.reasons,
        }),
      );

    const alongRouteCandidates = filteredPlaces
      .filter(
        (p) =>
          scoringCtx.routePlaceIds.has(p.id) ||
          this.isNearRoute(p, scoringCtx.routePlaceIds, allPlaces),
      )
      .slice(0, 8);

    const alongRouteCoords = alongRouteCandidates
      .map((p) => resolvePlaceCoordsOrNull(p))
      .filter((c): c is { lat: number; lng: number } => c != null);

    const liveDetourMap =
      useLiveRoutes && scoringCtx.routeAnchors.length >= 2
        ? await this.routeDetour.estimateDetourMinutesBatch({
            places: alongRouteCoords,
            routeAnchors: scoringCtx.routeAnchors,
            countryCode: scoringCtx.countryCode,
            useLiveRoutes: true,
            limit: 8,
          })
        : null;

    const alongRoute = alongRouteCandidates.map((p) => {
      const coords = resolvePlaceCoordsOrNull(p);
      const detourKey = coords ? `${coords.lat},${coords.lng}` : null;
      const liveDetour = detourKey && liveDetourMap ? liveDetourMap.get(detourKey) : null;
      const detour =
        liveDetour?.detourMinutes ??
        estimateDetourMinutes(p, scoringCtx.routeAnchors, scoringCtx.countryCode);
      return mapPlaceToRecommendationItem(p, {
        distanceFromRouteKm: detour != null ? Math.max(0, Math.round(detour / 1.8)) : 0,
        detourMinutes: detour ?? undefined,
        detourMethod: liveDetour?.method,
        badge: detour != null && detour <= 20 ? `绕路约 ${detour} 分钟` : null,
      });
    });

    const rainyDay = allPlaces
      .filter((p) => isRainyDayFriendlyPlace(p))
      .sort((a, b) => rainyDayFriendlyScore(b) - rainyDayFriendlyScore(a))
      .slice(0, 8)
      .map((p) => mapPlaceToRecommendationItem(p));

    const gapCategories = scoringCtx.experienceCoverage.gaps;
    const experienceGap = allPlaces
      .filter(
        (p) =>
          !scoringCtx.scheduledPlaceIds.has(p.id) &&
          experienceGapScore(p, gapCategories) > 0,
      )
      .sort((a, b) => experienceGapScore(b, gapCategories) - experienceGapScore(a, gapCategories))
      .slice(0, 8)
      .map((p) =>
        mapPlaceToRecommendationItem(p, {
          recommendationReasons: gapCategories.map((g) => `补足${EXPERIENCE_CATEGORY_LABELS[g]}`),
        }),
      );

    const catalog = ATTRACTION_EXPLORE_RECOMMENDATION_GROUPS;
    const groups: AttractionExploreRecommendationGroup[] = [];

    if (viewTab === 'along_route') {
      if (alongRoute.length) {
        groups.push({
          groupId: catalog[1].groupId,
          title: catalog[1].title,
          subtitle: '基于当前路线边际绕行成本',
          items: alongRoute,
        });
      }
      if (core.length) {
        groups.push({ groupId: catalog[0].groupId, title: catalog[0].title, items: core.slice(0, 6) });
      }
      return groups;
    }

    if (core.length) groups.push({ groupId: catalog[0].groupId, title: catalog[0].title, items: core });
    if (alongRoute.length) {
      groups.push({
        groupId: catalog[1].groupId,
        title: catalog[1].title,
        subtitle: '基于当前路线边际绕行成本',
        items: alongRoute,
      });
    }
    if (rainyDay.length) groups.push({ groupId: catalog[2].groupId, title: catalog[2].title, items: rainyDay });
    if (experienceGap.length) {
      groups.push({
        groupId: catalog[3].groupId,
        title: catalog[3].title,
        subtitle:
          gapCategories.length > 0
            ? `当前缺少：${gapCategories.map((g) => EXPERIENCE_CATEGORY_LABELS[g]).join('、')}`
            : undefined,
        items: experienceGap,
      });
    }

    if (groups.length === 0 && filteredPlaces.length) {
      groups.push({
        groupId: 'fallback',
        title: '推荐景点',
        items: filteredPlaces.slice(0, 12).map((p) => mapPlaceToRecommendationItem(p)),
      });
    }

    return groups;
  }

  private isNearRoute(place: PlaceRow, routePlaceIds: Set<number>, allPlaces: PlaceRow[]): boolean {
    if (routePlaceIds.size === 0) return false;
    const coords = resolvePlaceCoordsOrNull(place);
    if (!coords) return false;

    for (const routePlaceId of routePlaceIds) {
      const anchor = allPlaces.find((p) => p.id === routePlaceId);
      const anchorCoords = anchor ? resolvePlaceCoordsOrNull(anchor) : null;
      if (!anchorCoords) continue;
      const km = haversineKm(coords.lat, coords.lng, anchorCoords.lat, anchorCoords.lng);
      if (km <= 35) return true;
    }
    return false;
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
