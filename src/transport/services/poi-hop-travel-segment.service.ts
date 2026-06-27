/**
 * POI 跳点路段 — 与 GET .../days/:dayId/travel-info 同源
 */

import { Injectable, Optional } from '@nestjs/common';
import { SmartRoutesService } from './smart-routes.service';
import {
  TravelTimeEstimatorService,
  type PoiTravelMode,
} from './travel-time-estimator.service';
import { isImplausibleTravelDuration } from '../utils/travel-duration-sanity.util';

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

@Injectable()
export class PoiHopTravelSegmentService {
  constructor(
    private readonly travelTimeEstimator: TravelTimeEstimatorService,
    @Optional() private readonly smartRoutesService?: SmartRoutesService,
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

    if (input.useRouteApi !== false && this.smartRoutesService) {
      try {
        const routes = await this.smartRoutesService.getRoutes(
          input.from.lat,
          input.from.lng,
          input.to.lat,
          input.to.lng,
          travelMode,
        );
        const route = routes[0] as
          | {
              durationMinutes?: number;
              distanceMeters?: number;
              distanceKm?: number;
            }
          | undefined;
        if (route?.durationMinutes) {
          durationMinutes = route.durationMinutes;
          distanceMeters =
            route.distanceMeters != null
              ? Math.round(route.distanceMeters)
              : route.distanceKm != null
                ? Math.round(route.distanceKm * 1000)
                : Math.round(routeDistanceKm * 1000);
          source = 'route_api';
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
    }

    return {
      durationMinutes: Math.max(1, Math.round(durationMinutes)),
      distanceMeters: Math.max(0, Math.round(distanceMeters)),
      travelMode,
      source,
    };
  }
}
