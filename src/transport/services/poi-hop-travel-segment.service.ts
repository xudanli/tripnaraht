/**
 * POI 跳点路段 — 与 GET .../days/:dayId/travel-info 同源
 */

import { Injectable, Optional } from '@nestjs/common';
import { SmartRoutesService } from './smart-routes.service';
import { RouteGeometryService } from './route-geometry.service';
import {
  TravelTimeEstimatorService,
  type PoiTravelMode,
} from './travel-time-estimator.service';
import { isImplausibleTravelDuration } from '../utils/travel-duration-sanity.util';
import { encodePolyline } from '../utils/encoded-polyline.util';
import {
  mapPoiHopSourceToKind,
  projectLegacyDurationToEtaEnvelope,
  type TravelEtaEnvelopeV1,
  type TravelEtaRouteProvider,
  type TravelRouteGeometryV1,
} from '../contracts/travel-eta.contract';

export type TripDefaultTravelMode = 'DRIVING' | 'TRANSIT';

export interface PoiHopTravelSegmentInput {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  preferredMode?: string | null;
  defaultMode?: TripDefaultTravelMode;
  /** false = 仅用启发式（reality kernel / 离线） */
  useRouteApi?: boolean;
}

export interface PoiHopTravelSegmentResult {
  durationMinutes: number;
  distanceMeters: number;
  travelMode: PoiTravelMode;
  source: 'route_api' | 'heuristic';
  /** L1/L2 ETA envelope — durationMinutes === eta.planningDurationMin (L2 not applied yet) */
  eta: TravelEtaEnvelopeV1;
}

export function resolveTripDefaultTravelMode(
  pacingConfig: unknown,
): TripDefaultTravelMode {
  const tm = (pacingConfig as { travelMode?: string } | null)?.travelMode?.toUpperCase();
  if (tm === 'PUBLIC_TRANSIT') return 'TRANSIT';
  return 'DRIVING';
}

export function estimateRouteDistanceKm(straightDistanceKm: number, travelMode: string): number {
  if (travelMode === 'DRIVING' && straightDistanceKm >= 50) {
    return straightDistanceKm * 1.2;
  }
  return straightDistanceKm;
}

/** 与 TravelTimeEstimatorService.inferTravelMode 一致：超过此距离不应步行 */
const WALKING_MAX_STRAIGHT_KM = 2;

export function inferPoiHopTravelMode(
  straightDistanceKm: number,
  defaultMode: TripDefaultTravelMode,
  preferredMode?: string | null,
): PoiTravelMode {
  if (preferredMode && ['WALKING', 'DRIVING', 'TRANSIT'].includes(preferredMode)) {
    const mode = preferredMode as PoiTravelMode;
    if (mode === 'WALKING' && straightDistanceKm >= WALKING_MAX_STRAIGHT_KM) {
      // 忽略 DB 中误存的 WALKING（如日程空档写入）
    } else {
      return mode;
    }
  }
  if (straightDistanceKm < 1) return 'WALKING';
  if (defaultMode === 'TRANSIT') {
    if (straightDistanceKm < 2) return 'WALKING';
    if (straightDistanceKm < 50) return 'DRIVING';
    return 'TRANSIT';
  }
  return 'DRIVING';
}

function straightLineGeometry(from: { lat: number; lng: number }, to: { lat: number; lng: number }): TravelRouteGeometryV1 {
  return {
    encoding: 'ENCODED_POLYLINE',
    value: encodePolyline([from, to]),
    pointCount: 2,
    source: 'STRAIGHT_LINE',
  };
}

@Injectable()
export class PoiHopTravelSegmentService {
  constructor(
    private readonly travelTimeEstimator: TravelTimeEstimatorService,
    @Optional() private readonly smartRoutesService?: SmartRoutesService,
    @Optional() private readonly routeGeometryService?: RouteGeometryService,
  ) {}

  async resolveSegment(input: PoiHopTravelSegmentInput): Promise<PoiHopTravelSegmentResult> {
    const result = await this.computeSegment(input);
    if (
      input.preferredMode &&
      isImplausibleTravelDuration({
        distanceMeters: result.distanceMeters,
        durationMinutes: result.durationMinutes,
      })
    ) {
      return this.computeSegment({ ...input, preferredMode: undefined });
    }
    return result;
  }

  private async computeSegment(input: PoiHopTravelSegmentInput): Promise<PoiHopTravelSegmentResult> {
    const straightKm = this.travelTimeEstimator.haversineDistanceKm(input.from, input.to);
    const defaultMode = input.defaultMode ?? 'DRIVING';
    const travelMode = inferPoiHopTravelMode(straightKm, defaultMode, input.preferredMode);
    const routeDistanceKm = estimateRouteDistanceKm(straightKm, travelMode);

    let durationMinutes: number | null = null;
    let distanceMeters: number | null = null;
    let source: PoiHopTravelSegmentResult['source'] = 'heuristic';
    let provider: TravelEtaRouteProvider = 'HEURISTIC';
    let geometry: TravelRouteGeometryV1 | null = null;
    let cacheHit = false;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;
    let providerRequestId: string | undefined;
    const routeProfile =
      travelMode === 'WALKING' ? 'WALKING' : travelMode === 'TRANSIT' ? 'TRANSIT' : 'DRIVING';

    if (input.useRouteApi !== false && this.routeGeometryService) {
      try {
        const geo = await this.routeGeometryService.resolveGeometry({
          from: input.from,
          to: input.to,
          travelMode,
          useRouteApi: true,
        });
        if (geo.geometrySource === 'route_api' && geo.durationMinutes) {
          durationMinutes = geo.durationMinutes;
          distanceMeters =
            geo.distanceMeters != null
              ? Math.round(geo.distanceMeters)
              : Math.round(routeDistanceKm * 1000);
          source = 'route_api';
          provider =
            geo.provider === 'GOOGLE' || geo.provider === 'AMAP' || geo.provider === 'MAPBOX'
              ? geo.provider
              : geo.provider === 'HEURISTIC'
                ? 'HEURISTIC'
                : 'UNKNOWN';
          cacheHit = !!geo.cacheHit;
          fallbackUsed = !!geo.fallbackUsed;
          fallbackReason = geo.fallbackReason;
          providerRequestId = geo.providerRequestId;
          geometry = {
            encoding: 'ENCODED_POLYLINE',
            value: geo.polyline,
            source: 'ROUTE_API',
          };
        }
      } catch {
        // fall through to SmartRoutes / heuristic
      }
    }

    if (
      durationMinutes == null &&
      input.useRouteApi !== false &&
      this.smartRoutesService
    ) {
      try {
        const routes = await this.smartRoutesService.getRoutes(
          input.from.lat,
          input.from.lng,
          input.to.lat,
          input.to.lng,
          travelMode,
        );
        const route = routes[0];
        if (route?.durationMinutes) {
          durationMinutes = route.durationMinutes;
          distanceMeters =
            route.distanceMeters != null
              ? Math.round(route.distanceMeters)
              : route.walkDistance > 0 && travelMode === 'WALKING'
                ? Math.round(route.walkDistance)
                : Math.round(routeDistanceKm * 1000);
          source = 'route_api';
          if (
            route.routeProvider === 'GOOGLE' ||
            route.routeProvider === 'AMAP' ||
            route.routeProvider === 'MAPBOX'
          ) {
            provider = route.routeProvider;
          } else {
            // Should not happen after SmartRoutes tagProvider force-stamp; treat as gap metric
            provider = 'UNKNOWN';
            fallbackReason = fallbackReason ?? 'SMART_ROUTES_MISSING_PROVIDER';
          }
          fallbackUsed = route.fallbackUsed ?? fallbackUsed;
          fallbackReason = route.fallbackReason ?? fallbackReason;
          providerRequestId = route.providerRequestId ?? providerRequestId;
          if (route.encodedPolyline?.trim()) {
            geometry = {
              encoding: 'ENCODED_POLYLINE',
              value: route.encodedPolyline.trim(),
              source: 'ROUTE_API',
            };
          }
        }
      } catch {
        // fallback to heuristic
      }
    }

    if (durationMinutes == null || distanceMeters == null) {
      durationMinutes = this.travelTimeEstimator.estimateDurationMinutes(
        routeDistanceKm,
        travelMode,
      );
      distanceMeters = Math.round(routeDistanceKm * 1000);
      source = 'heuristic';
      provider = 'HEURISTIC';
      fallbackUsed = true;
      fallbackReason = fallbackReason ?? 'NO_ROUTE_API_RESULT';
      geometry = straightLineGeometry(input.from, input.to);
    } else if (!geometry) {
      geometry = straightLineGeometry(input.from, input.to);
      if (!fallbackReason) {
        fallbackUsed = true;
        fallbackReason = 'DURATION_WITHOUT_POLYLINE_STRAIGHT_LINE';
      }
    }

    const durationRounded = Math.max(1, Math.round(durationMinutes));
    const distanceRounded = Math.max(0, Math.round(distanceMeters));
    const eta = projectLegacyDurationToEtaEnvelope({
      durationMin: durationRounded,
      distanceM: distanceRounded,
      sourceKind: mapPoiHopSourceToKind(source),
      provider,
      geometry,
      cacheHit,
      fallbackUsed,
      fallbackReason,
      providerRequestId,
      routeProfile,
      confidence:
        source === 'route_api'
          ? provider === 'UNKNOWN'
            ? 0.55
            : geometry?.source === 'ROUTE_API'
              ? 0.88
              : 0.8
          : 0.55,
    });

    return {
      durationMinutes: durationRounded,
      distanceMeters: distanceRounded,
      travelMode,
      source,
      eta,
    };
  }
}
