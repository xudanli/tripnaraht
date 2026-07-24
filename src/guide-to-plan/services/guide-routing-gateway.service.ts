import { Injectable, Logger, Optional } from '@nestjs/common';
import { PoiHopTravelSegmentService } from '../../transport/services/poi-hop-travel-segment.service';
import { TravelTimeEstimatorService } from '../../transport/services/travel-time-estimator.service';
import type {
  GuideRouteMatrixPoint,
  GuideRouteMatrixResult,
  GuideRouteRequest,
  GuideRouteResult,
} from '../types/guide-spatial.types';
import { GuideRouteConstraintGateway } from './route-constraint/guide-route-constraint.gateway.service';

const MATRIX_PAIR_LIMIT = 20;

/**
 * 路由层网关：Planner 只依赖此接口，底层接 SmartRoutes / 自托管 OSM / 启发式降级。
 */
@Injectable()
export class GuideRoutingGatewayService {
  private readonly logger = new Logger(GuideRoutingGatewayService.name);

  constructor(
    @Optional() private readonly poiHopSegment?: PoiHopTravelSegmentService,
    @Optional() private readonly travelTimeEstimator?: TravelTimeEstimatorService,
    @Optional() private readonly routeConstraint?: GuideRouteConstraintGateway,
  ) {}

  async calculateRoute(
    input: GuideRouteRequest & {
      travelDate?: string;
      placeNames?: string[];
      drivingMinutesEstimate?: number;
      travelContext?: import('../types/guide-to-plan.types').GuideTravelContext | null;
    },
  ): Promise<GuideRouteResult> {
    const travelMode = input.mode;

    if (this.poiHopSegment) {
      try {
        const segment = await this.poiHopSegment.resolveSegment({
          from: { lat: input.from.lat, lng: input.from.lng },
          to: { lat: input.to.lat, lng: input.to.lng },
          preferredMode: travelMode,
          defaultMode: travelMode === 'TRANSIT' ? 'TRANSIT' : 'DRIVING',
          useRouteApi: true,
        });
        return this.enrichWithAvailability(
          {
            distanceMeters: segment.distanceMeters,
            durationMinutes: segment.durationMinutes,
            travelMode: segment.travelMode,
            source: segment.source === 'route_api' ? 'road_network' : 'heuristic',
          },
          input,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Route API failed, fallback heuristic: ${message}`);
      }
    }

    return this.enrichWithAvailability(this.heuristicRoute(input), input);
  }

  private async enrichWithAvailability(
    route: GuideRouteResult,
    input: GuideRouteRequest & {
      travelDate?: string;
      placeNames?: string[];
      drivingMinutesEstimate?: number;
      travelContext?: import('../types/guide-to-plan.types').GuideTravelContext | null;
    },
  ): Promise<GuideRouteResult> {
    if (!this.routeConstraint) {
      return route;
    }
    const availability = await this.routeConstraint.assessDayRoute({
      countryCode: input.countryCode,
      travelDate: input.travelDate,
      placeNames: input.placeNames ?? [],
      drivingMinutes: input.drivingMinutesEstimate ?? route.durationMinutes,
      routeExists: route.durationMinutes > 0,
      travelContext: input.travelContext,
    });
    route.availability = availability;
    return route;
  }

  async calculateMatrix(
    points: GuideRouteMatrixPoint[],
    mode: GuideRouteRequest['mode'],
    countryCode?: string,
  ): Promise<GuideRouteMatrixResult> {
    const n = Math.min(points.length, MATRIX_PAIR_LIMIT);
    const slice = points.slice(0, n);
    const minutes: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const sources: GuideRouteMatrixResult['sources'] = Array.from({ length: n }, () =>
      Array(n).fill('self' as const),
    );

    const pairs: Array<{ i: number; j: number }> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push({ i, j });
      }
    }

    await Promise.all(
      pairs.map(async ({ i, j }) => {
        const route = await this.calculateRoute({
          from: { lat: slice[i].lat, lng: slice[i].lng, placeId: slice[i].placeId },
          to: { lat: slice[j].lat, lng: slice[j].lng, placeId: slice[j].placeId },
          mode,
          countryCode,
        });
        minutes[i][j] = route.durationMinutes;
        minutes[j][i] = route.durationMinutes;
        sources[i][j] = route.source;
        sources[j][i] = route.source;
      }),
    );

    return {
      pointIds: slice.map((p) => p.id),
      minutes,
      sources,
    };
  }

  private heuristicRoute(input: GuideRouteRequest): GuideRouteResult {
    const estimator = this.travelTimeEstimator ?? new TravelTimeEstimatorService();
    const estimate = estimator.estimatePoiTravelMinutes(
      { lat: input.from.lat, lng: input.from.lng },
      { lat: input.to.lat, lng: input.to.lng },
      {
        travelMode: input.mode,
        countryCode: input.countryCode,
        defaultDriving: input.mode === 'DRIVING',
      },
    );
    return {
      distanceMeters: Math.round(estimate.distanceKm * 1000),
      durationMinutes: estimate.durationMinutes,
      travelMode: estimate.travelMode,
      source: 'heuristic',
    };
  }
}
