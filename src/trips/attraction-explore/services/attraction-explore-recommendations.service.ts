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
  scoreAttractionExploreNameMatch,
} from '../utils/attraction-explore-place.util';
import {
  estimateDetourMinutes,
  rankAttractionExplorePlaces,
  type AttractionExploreScoringContext,
} from '../utils/attraction-explore-scoring.util';
import {
  isPlaceAlreadyOnDay,
  normalizeAttractionTitle,
  placeDisplayTitles,
  type DayRecommendationContext,
} from '../utils/attraction-explore-day-context.util';
import {
  buildContextTip,
  enrichRecommendationCard,
  flattenUniqueRecommendationItems,
  matchesQuickFilter,
  sortRecommendationItems,
} from '../utils/attraction-explore-card.util';
import type { AttractionExploreSortId } from '../types/attraction-explore.types';

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
    dayIndex?: number;
    quickFilterIds?: string[];
    sort?: AttractionExploreSortId;
    q?: string;
    lat?: number;
    lng?: number;
  }): Promise<AttractionExploreRecommendationsView> {
    const viewTab = input.viewTab ?? 'recommended';
    const dayIndex = this.normalizeDayIndex(input.dayIndex);
    const places = await this.loadDestinationPlaces(input.destination, 120);
    let filtered = this.applyFilters(places, input.themeIds, input.suitabilityIds);
    const routeContext = await this.loadRouteContext(input.tripId, places, dayIndex);
    const origin = this.resolveUserOrDayOrigin(input.lat, input.lng, routeContext);
    const countryCode = input.destination.toUpperCase();

    if (routeContext.dayContext) {
      filtered = filtered.filter((p) => !isPlaceAlreadyOnDay(p, routeContext.dayContext!));
    }

    filtered = this.applyQuickFilters(filtered, input.quickFilterIds, {
      origin,
      countryCode,
      suitabilityIds: input.suitabilityIds,
    });

    if (input.q?.trim()) {
      const q = input.q.trim();
      filtered = filtered.filter((p) => scoreAttractionExploreNameMatch(p, q) > 0);
    }

    const scoringCtx: AttractionExploreScoringContext = {
      themeIds: input.themeIds,
      suitabilityIds: input.suitabilityIds,
      routePlaceIds: routeContext.routePlaceIds,
      scheduledPlaceIds: routeContext.scheduledPlaceIds,
      routeAnchors:
        routeContext.dayContext && routeContext.dayContext.anchors.length > 0
          ? routeContext.dayContext.anchors
          : routeContext.routeAnchors,
      experienceCoverage: routeContext.experienceCoverage,
      weatherHint: input.weatherHint ?? null,
      countryCode,
      dayContext: routeContext.dayContext,
    };

    let groups = await this.buildGroups(
      filtered,
      places,
      viewTab,
      scoringCtx,
      input.useLiveRoutes,
      routeContext,
    );

    groups = this.enrichGroups(groups, places, {
      origin,
      countryCode,
      weatherHint: input.weatherHint,
    });

    const tip = buildContextTip(input.weatherHint);
    let items = sortRecommendationItems(
      flattenUniqueRecommendationItems(groups),
      input.sort ?? 'smart',
    );

    if (input.sort && input.sort !== 'smart') {
      groups = groups.map((g) => ({
        ...g,
        items: sortRecommendationItems(g.items, input.sort),
      }));
    }

    return {
      tripId: input.tripId,
      viewTab,
      ...(dayIndex != null ? { dayIndex } : {}),
      ...(tip ? { contextTip: tip, aiTip: tip } : {}),
      items,
      groups,
    };
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
    dayIndex?: number;
    quickFilterIds?: string[];
    sort?: AttractionExploreSortId;
    lat?: number;
    lng?: number;
  }): Promise<AttractionExploreSearchView> {
    const dayIndex = this.normalizeDayIndex(input.dayIndex);
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

    const routeContext = await this.loadRouteContext(input.tripId, places, dayIndex);
    const origin = this.resolveUserOrDayOrigin(input.lat, input.lng, routeContext);

    if (compiledIntent.excludeVisited) {
      filtered = filtered.filter((p) => !routeContext.scheduledPlaceIds.has(p.id));
    }

    if (q) {
      const keywordHits = places.filter(
        (p) => scoreAttractionExploreNameMatch(p, q, compiledIntent.keywords) > 0,
      );
      const mergedIds = new Set(filtered.map((p) => p.id));
      for (const place of keywordHits) {
        if (!mergedIds.has(place.id)) filtered.push(place);
      }
    }

    filtered = this.applyQuickFilters(filtered, input.quickFilterIds, {
      origin,
      countryCode,
      suitabilityIds: merged.suitabilityIds,
    });

    const weatherHint =
      compiledIntent.weatherMode === 'RAINY_DAY' ? 'rain' : (input.weatherHint ?? null);

    const scoringCtx: AttractionExploreScoringContext = {
      themeIds: merged.themeIds,
      suitabilityIds: merged.suitabilityIds,
      routePlaceIds: routeContext.routePlaceIds,
      scheduledPlaceIds: routeContext.scheduledPlaceIds,
      routeAnchors:
        routeContext.dayContext && routeContext.dayContext.anchors.length > 0
          ? routeContext.dayContext.anchors
          : routeContext.routeAnchors,
      experienceCoverage: routeContext.experienceCoverage,
      weatherHint,
      countryCode,
      maxDetourMinutes: compiledIntent.maxDetourMinutes,
      dayContext: routeContext.dayContext,
    };

    const limit = input.limit ?? 20;
    const nameMatchedIds = new Set(
      q
        ? filtered
            .filter((p) => scoreAttractionExploreNameMatch(p, q, compiledIntent.keywords) > 0)
            .map((p) => p.id)
        : [],
    );
    const rankedPool = rankAttractionExplorePlaces(filtered, scoringCtx, filtered.length);
    const ranked = [...rankedPool]
      .sort((a, b) => {
        const nameDelta =
          scoreAttractionExploreNameMatch(b.place, q, compiledIntent.keywords) -
          scoreAttractionExploreNameMatch(a.place, q, compiledIntent.keywords);
        if (nameDelta !== 0) return nameDelta;
        return b.score - a.score;
      })
      .slice(0, limit)
      .map((row) => {
        if (!nameMatchedIds.has(row.place.id)) return row;
        const nameMatch = scoreAttractionExploreNameMatch(row.place, q, compiledIntent.keywords);
        return {
          ...row,
          score: Math.min(1, row.score + 0.15 * nameMatch),
          reasons: [...row.reasons, nameMatch >= 2 ? '名称精确匹配' : '名称关键词匹配'],
        };
      });

    const detourBatch =
      input.useLiveRoutes && scoringCtx.routeAnchors.length >= 2
        ? await this.routeDetour.estimateDetourMinutesBatch({
            places: ranked
              .map((r) => resolvePlaceCoordsOrNull(r.place))
              .filter((c): c is { lat: number; lng: number } => c != null),
            routeAnchors: scoringCtx.routeAnchors,
            countryCode,
            useLiveRoutes: true,
            limit: input.limit ?? 20,
          })
        : null;

    const items = sortRecommendationItems(
      ranked.map((row, idx) => {
        const coords = resolvePlaceCoordsOrNull(row.place);
        const detourKey = coords ? `${coords.lat},${coords.lng}` : null;
        const liveDetour = detourKey && detourBatch ? detourBatch.get(detourKey) : null;
        const detourMinutes =
          liveDetour?.detourMinutes ??
          estimateDetourMinutes(row.place, scoringCtx.routeAnchors, countryCode) ??
          undefined;
        const flags = this.placeItineraryFlags(row.place, routeContext);

        const base = mapPlaceToRecommendationItem(row.place, {
          score: Number(row.score.toFixed(2)),
          recommendationReasons: row.reasons,
          detourMinutes,
          detourMethod: liveDetour?.method,
          badge: flags.alreadyInDay ? '已在当日' : flags.alreadyInItinerary ? '已在行程' : null,
          ...flags,
        });
        return enrichRecommendationCard(base, row.place, {
          origin,
          countryCode,
          weatherHint,
          isAiRecommended: idx < 3,
        });
      }),
      input.sort ?? 'smart',
    );

    const viewTab = input.viewTab ?? merged.viewTab ?? 'recommended';
    const tip = buildContextTip(weatherHint);
    const groups = items.length
      ? [{ groupId: 'search_results', title: `「${input.query}」匹配结果`, items }]
      : [];

    return {
      tripId: input.tripId,
      viewTab,
      ...(dayIndex != null ? { dayIndex } : {}),
      ...(tip ? { contextTip: tip, aiTip: tip } : {}),
      compiledIntent,
      items,
      groups,
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

  private async loadRouteContext(
    tripId: string,
    allPlaces: PlaceRow[],
    dayIndex?: number,
  ): Promise<{
    routePlaceIds: Set<number>;
    scheduledPlaceIds: Set<number>;
    routeAnchors: Array<{ lat: number; lng: number }>;
    experienceCoverage: ReturnType<typeof buildExperienceCoverage>;
    dayContext?: DayRecommendationContext;
  }> {
    const [tripRow, days] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      }),
      this.prisma.tripDay.findMany({
        where: { tripId },
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            include: { Place: { include: { City: true } } },
            orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
          },
        },
      }),
    ]);

    const routePlaceIds = new Set<number>();
    for (const day of days) {
      for (const item of day.ItineraryItem) {
        if (item.placeId) routePlaceIds.add(item.placeId);
      }
    }
    const scheduledPlaceIds = new Set(routePlaceIds);
    const scheduledPlaces = allPlaces.filter((p) => scheduledPlaceIds.has(p.id));

    const routeAnchors = [...routePlaceIds]
      .map((id) => allPlaces.find((p) => p.id === id))
      .map((p) => (p ? resolvePlaceCoordsOrNull(p) : null))
      .filter((c): c is { lat: number; lng: number } => c != null);

    let dayContext: DayRecommendationContext | undefined;
    if (dayIndex != null && dayIndex >= 1 && dayIndex <= days.length) {
      const day = days[dayIndex - 1];
      const meta =
        tripRow?.metadata && typeof tripRow.metadata === 'object' && !Array.isArray(tripRow.metadata)
          ? (tripRow.metadata as Record<string, unknown>)
          : {};
      const themes =
        meta.dayThemes && typeof meta.dayThemes === 'object' && !Array.isArray(meta.dayThemes)
          ? (meta.dayThemes as Record<string, unknown>)
          : {};
      const labels =
        meta.dayLabels && typeof meta.dayLabels === 'object' && !Array.isArray(meta.dayLabels)
          ? (meta.dayLabels as Record<string, unknown>)
          : {};
      const themeRaw = themes[String(dayIndex)] ?? themes[dayIndex as unknown as string];
      const labelRaw = labels[String(dayIndex)] ?? labels[dayIndex as unknown as string];

      const placeIds = new Set<number>();
      const rawTitles: string[] = [];
      const titleKeys = new Set<string>();
      const cityNames: string[] = [];
      const anchors: Array<{ lat: number; lng: number }> = [];

      for (const item of day.ItineraryItem) {
        if (item.placeId) placeIds.add(item.placeId);
        const place = item.Place;
        if (place) {
          for (const title of placeDisplayTitles(place)) {
            rawTitles.push(title);
            const key = normalizeAttractionTitle(title);
            if (key) titleKeys.add(key);
          }
          const city =
            place.City?.nameCN?.trim() ||
            place.City?.name?.trim() ||
            place.City?.nameEN?.trim();
          if (city) cityNames.push(city);
          const coords = resolvePlaceCoordsOrNull(place);
          if (coords) anchors.push(coords);
        } else if (item.note?.trim()) {
          rawTitles.push(item.note.trim());
          const key = normalizeAttractionTitle(item.note);
          if (key) titleKeys.add(key);
        }
      }

      dayContext = {
        dayIndex,
        theme: typeof themeRaw === 'string' ? themeRaw : null,
        label: typeof labelRaw === 'string' ? labelRaw : typeof themeRaw === 'string' ? themeRaw : null,
        placeIds,
        titleKeys,
        rawTitles,
        cityNames: [...new Set(cityNames)],
        anchors,
      };
    }

    return {
      routePlaceIds,
      scheduledPlaceIds,
      routeAnchors,
      experienceCoverage: buildExperienceCoverage(scheduledPlaces),
      dayContext,
    };
  }

  private placeItineraryFlags(
    place: { id: number; nameCN?: string | null; nameEN?: string | null },
    routeContext: {
      scheduledPlaceIds: Set<number>;
      dayContext?: DayRecommendationContext;
    },
  ): { alreadyInItinerary?: boolean; alreadyInDay?: boolean } {
    const alreadyInDay = routeContext.dayContext
      ? isPlaceAlreadyOnDay(place, routeContext.dayContext)
      : false;
    const alreadyInItinerary =
      alreadyInDay || routeContext.scheduledPlaceIds.has(place.id);
    return {
      ...(alreadyInItinerary ? { alreadyInItinerary: true } : {}),
      ...(alreadyInDay ? { alreadyInDay: true } : {}),
    };
  }

  private decorateItem(
    place: PlaceRow,
    routeContext: {
      scheduledPlaceIds: Set<number>;
      dayContext?: DayRecommendationContext;
    },
    extras?: Parameters<typeof mapPlaceToRecommendationItem>[1],
  ) {
    const flags = this.placeItineraryFlags(place, routeContext);
    const badge =
      extras?.badge ??
      (flags.alreadyInDay ? '已在当日' : flags.alreadyInItinerary ? '已在行程' : null);
    return mapPlaceToRecommendationItem(place, {
      ...extras,
      badge,
      ...flags,
    });
  }

  private normalizeDayIndex(dayIndex?: number): number | undefined {
    if (dayIndex == null || !Number.isFinite(dayIndex)) return undefined;
    return Math.max(1, Math.floor(dayIndex));
  }

  private async buildGroups(
    filteredPlaces: PlaceRow[],
    allPlaces: PlaceRow[],
    viewTab: AttractionExploreViewTab,
    scoringCtx: AttractionExploreScoringContext,
    useLiveRoutes?: boolean,
    routeContext?: {
      scheduledPlaceIds: Set<number>;
      dayContext?: DayRecommendationContext;
    },
  ): Promise<AttractionExploreRecommendationGroup[]> {
    const ctx = routeContext ?? {
      scheduledPlaceIds: scoringCtx.scheduledPlaceIds,
      dayContext: scoringCtx.dayContext,
    };

    if (viewTab === 'map') {
      return [
        {
          groupId: 'map_highlights',
          title: '地图精选',
          items: filteredPlaces
            .filter((p) => resolvePlaceCoordsOrNull(p))
            .slice(0, 24)
            .map((p) => this.decorateItem(p, ctx)),
        },
      ];
    }

    const ranked = rankAttractionExplorePlaces(filteredPlaces, scoringCtx, 24);

    const core = ranked
      .filter((row) => isCoreAttraction(row.place) || row.score >= 0.55)
      .slice(0, 8)
      .map((row, idx) =>
        this.decorateItem(row.place as PlaceRow, ctx, {
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
      return this.decorateItem(p, ctx, {
        distanceFromRouteKm: detour != null ? Math.max(0, Math.round(detour / 1.8)) : 0,
        detourMinutes: detour ?? undefined,
        detourMethod: liveDetour?.method,
        badge: detour != null && detour <= 20 ? `绕路约 ${detour} 分钟` : null,
      });
    });

    const rainyDay = allPlaces
      .filter(
        (p) =>
          isRainyDayFriendlyPlace(p) &&
          !(ctx.dayContext && isPlaceAlreadyOnDay(p, ctx.dayContext)),
      )
      .sort((a, b) => rainyDayFriendlyScore(b) - rainyDayFriendlyScore(a))
      .slice(0, 8)
      .map((p) => this.decorateItem(p, ctx));

    const gapCategories = scoringCtx.experienceCoverage.gaps;
    const experienceGap = allPlaces
      .filter(
        (p) =>
          !scoringCtx.scheduledPlaceIds.has(p.id) &&
          !(ctx.dayContext && isPlaceAlreadyOnDay(p, ctx.dayContext)) &&
          experienceGapScore(p, gapCategories) > 0,
      )
      .sort((a, b) => experienceGapScore(b, gapCategories) - experienceGapScore(a, gapCategories))
      .slice(0, 8)
      .map((p) =>
        this.decorateItem(p, ctx, {
          recommendationReasons: gapCategories.map((g) => `补足${EXPERIENCE_CATEGORY_LABELS[g]}`),
        }),
      );

    const catalog = ATTRACTION_EXPLORE_RECOMMENDATION_GROUPS;
    const groups: AttractionExploreRecommendationGroup[] = [];
    const daySubtitle = ctx.dayContext
      ? `围绕 Day ${ctx.dayContext.dayIndex}${
          ctx.dayContext.theme || ctx.dayContext.label
            ? ` · ${ctx.dayContext.theme || ctx.dayContext.label}`
            : ''
        }`
      : undefined;

    if (viewTab === 'along_route') {
      if (alongRoute.length) {
        groups.push({
          groupId: catalog[1].groupId,
          title: catalog[1].title,
          subtitle: daySubtitle ?? '基于当前路线边际绕行成本',
          items: alongRoute,
        });
      }
      if (core.length) {
        groups.push({
          groupId: catalog[0].groupId,
          title: catalog[0].title,
          subtitle: daySubtitle,
          items: core.slice(0, 6),
        });
      }
      return groups;
    }

    if (core.length) {
      groups.push({
        groupId: catalog[0].groupId,
        title: catalog[0].title,
        subtitle: daySubtitle,
        items: core,
      });
    }
    if (alongRoute.length) {
      groups.push({
        groupId: catalog[1].groupId,
        title: catalog[1].title,
        subtitle: daySubtitle ?? '基于当前路线边际绕行成本',
        items: alongRoute,
      });
    }
    if (rainyDay.length) {
      groups.push({ groupId: catalog[2].groupId, title: catalog[2].title, items: rainyDay });
    }
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
        subtitle: daySubtitle,
        items: filteredPlaces.slice(0, 12).map((p) => this.decorateItem(p, ctx)),
      });
    }

    return groups;
  }

  private applyQuickFilters(
    places: PlaceRow[],
    quickFilterIds: string[] | undefined,
    opts: {
      origin?: { lat: number; lng: number } | null;
      countryCode?: string;
      suitabilityIds?: string[];
    },
  ): PlaceRow[] {
    if (!quickFilterIds?.length) return places;
    return places.filter((place) =>
      quickFilterIds.every((id) =>
        matchesQuickFilter(place, id, {
          origin: opts.origin,
          countryCode: opts.countryCode,
          suitabilityIds: opts.suitabilityIds,
        }),
      ),
    );
  }

  private resolveUserOrDayOrigin(
    lat?: number,
    lng?: number,
    routeContext?: {
      dayContext?: DayRecommendationContext;
      routeAnchors: Array<{ lat: number; lng: number }>;
    },
  ): { lat: number; lng: number } | null {
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    const dayAnchor = routeContext?.dayContext?.anchors?.[0];
    if (dayAnchor) return dayAnchor;
    return routeContext?.routeAnchors?.[0] ?? null;
  }

  private enrichGroups(
    groups: AttractionExploreRecommendationGroup[],
    places: PlaceRow[],
    opts: {
      origin?: { lat: number; lng: number } | null;
      countryCode?: string;
      weatherHint?: string | null;
    },
  ): AttractionExploreRecommendationGroup[] {
    const placeById = new Map(places.map((p) => [p.id, p]));
    return groups.map((group) => ({
      ...group,
      items: group.items.map((item, idx) => {
        const place = placeById.get(item.placeId);
        if (!place) return item;
        return enrichRecommendationCard(item, place, {
          origin: opts.origin,
          countryCode: opts.countryCode,
          weatherHint: opts.weatherHint,
          isAiRecommended: group.groupId === 'first_time_must_see' && idx < 2,
        });
      }),
    }));
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
