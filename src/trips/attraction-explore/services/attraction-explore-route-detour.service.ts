import { Injectable, Logger, Optional } from '@nestjs/common';
import { TransportRoutingService } from '../../../transport/transport-routing.service';
import {
  estimateDrivingLeg,
  estimateMarginalDetourMinutes,
  estimatePlaceDetourToRoute,
  findBestRouteInsertion,
  type MarginalDetourEstimate,
  type RoutePoint,
  type TravelLegEstimate,
} from '../utils/attraction-explore-route-detour.util';

export type RouteDetourMethod = TravelLegEstimate['method'];

export interface AsyncMarginalDetourEstimate extends MarginalDetourEstimate {}

@Injectable()
export class AttractionExploreRouteDetourService {
  private readonly logger = new Logger(AttractionExploreRouteDetourService.name);

  constructor(
    @Optional() private readonly transportRouting?: TransportRoutingService,
  ) {}

  isLiveRoutesEnabled(): boolean {
    return (
      process.env.ATTRACTION_EXPLORE_LIVE_ROUTES === '1' ||
      process.env.ENABLE_GOOGLE_ROUTE_DETOUR === '1'
    );
  }

  async estimateDrivingLegAsync(
    from: RoutePoint,
    to: RoutePoint,
    options?: { countryCode?: string; travelDate?: Date; useLiveRoutes?: boolean },
  ): Promise<TravelLegEstimate & { method: RouteDetourMethod }> {
    const useLive = options?.useLiveRoutes ?? this.isLiveRoutesEnabled();
    if (useLive && this.transportRouting) {
      try {
        const route = await this.transportRouting.planPoiHopRoute(
          from.lat,
          from.lng,
          to.lat,
          to.lng,
          'drive',
        );
        const option = route.options[0];
        if (option?.durationMinutes != null) {
          return {
            distanceKm: (option.walkDistance ?? 0) / 1000 || estimateDrivingLeg(from, to, options).distanceKm,
            durationMinutes: option.durationMinutes,
            method: 'live_route_api',
          };
        }
      } catch (error) {
        this.logger.warn(
          `Live route leg failed, fallback heuristic: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return estimateDrivingLeg(from, to, options);
  }

  async estimateMarginalDetourMinutesAsync(input: {
    from: RoutePoint;
    to: RoutePoint;
    via: RoutePoint;
    countryCode?: string;
    travelDate?: Date;
    useLiveRoutes?: boolean;
  }): Promise<AsyncMarginalDetourEstimate> {
    const useLive = input.useLiveRoutes ?? this.isLiveRoutesEnabled();
    if (!useLive || !this.transportRouting) {
      return estimateMarginalDetourMinutes(input);
    }

    const [direct, leg1, leg2] = await Promise.all([
      this.estimateDrivingLegAsync(input.from, input.to, input),
      this.estimateDrivingLegAsync(input.from, input.via, input),
      this.estimateDrivingLegAsync(input.via, input.to, input),
    ]);

    return {
      detourMinutes: Math.max(0, leg1.durationMinutes + leg2.durationMinutes - direct.durationMinutes),
      extraDistanceKm: Math.max(0, leg1.distanceKm + leg2.distanceKm - direct.distanceKm),
      method: [leg1, leg2, direct].some((l) => l.method === 'live_route_api')
        ? 'live_route_api'
        : leg1.method,
    };
  }

  async findBestRouteInsertionAsync(input: {
    routePoints: RoutePoint[];
    candidate: RoutePoint;
    countryCode?: string;
    travelDate?: Date;
    useLiveRoutes?: boolean;
  }): Promise<(AsyncMarginalDetourEstimate & { segmentIndex: number }) | null> {
    if (input.routePoints.length === 0) return null;

    if (input.routePoints.length === 1) {
      const leg = await this.estimateDrivingLegAsync(input.routePoints[0]!, input.candidate, input);
      return {
        segmentIndex: 0,
        detourMinutes: leg.durationMinutes,
        extraDistanceKm: leg.distanceKm,
        method: leg.method,
        viaSegmentIndex: 0,
      };
    }

    let best: (AsyncMarginalDetourEstimate & { segmentIndex: number }) | null = null;

    for (let i = 0; i < input.routePoints.length - 1; i += 1) {
      const estimate = await this.estimateMarginalDetourMinutesAsync({
        from: input.routePoints[i]!,
        to: input.routePoints[i + 1]!,
        via: input.candidate,
        countryCode: input.countryCode,
        travelDate: input.travelDate,
        useLiveRoutes: input.useLiveRoutes,
      });
      const candidate = { ...estimate, segmentIndex: i };
      if (!best || candidate.detourMinutes < best.detourMinutes) {
        best = candidate;
      }
    }

    return best;
  }

  async estimatePlaceDetourToRouteAsync(input: {
    place: RoutePoint;
    routeAnchors: RoutePoint[];
    countryCode?: string;
    travelDate?: Date;
    useLiveRoutes?: boolean;
  }): Promise<AsyncMarginalDetourEstimate | null> {
    if (input.routeAnchors.length === 0) return null;
    if (input.routeAnchors.length === 1) {
      const leg = await this.estimateDrivingLegAsync(input.routeAnchors[0]!, input.place, input);
      return {
        detourMinutes: leg.durationMinutes,
        extraDistanceKm: leg.distanceKm,
        method: leg.method,
      };
    }

    const best = await this.findBestRouteInsertionAsync({
      routePoints: input.routeAnchors,
      candidate: input.place,
      countryCode: input.countryCode,
      travelDate: input.travelDate,
      useLiveRoutes: input.useLiveRoutes,
    });
    return best;
  }

  /** 批量估算绕路（限制并发，用于推荐/搜索） */
  async estimateDetourMinutesBatch(input: {
    places: RoutePoint[];
    routeAnchors: RoutePoint[];
    countryCode?: string;
    useLiveRoutes?: boolean;
    limit?: number;
  }): Promise<Map<string, AsyncMarginalDetourEstimate>> {
    const result = new Map<string, AsyncMarginalDetourEstimate>();
    const targets = input.places.slice(0, input.limit ?? 12);
    const useLive = input.useLiveRoutes ?? this.isLiveRoutesEnabled();
    if (!useLive || input.routeAnchors.length < 2) {
      for (const place of targets) {
        const key = `${place.lat},${place.lng}`;
        const sync = estimatePlaceDetourToRoute({
          place,
          routeAnchors: input.routeAnchors,
          countryCode: input.countryCode,
        });
        if (sync) result.set(key, sync);
      }
      return result;
    }

    await Promise.all(
      targets.map(async (place) => {
        const key = `${place.lat},${place.lng}`;
        const detour = await this.estimatePlaceDetourToRouteAsync({
          place,
          routeAnchors: input.routeAnchors,
          countryCode: input.countryCode,
          useLiveRoutes: true,
        });
        if (detour) result.set(key, detour);
      }),
    );
    return result;
  }
}
