import { Injectable, Logger } from '@nestjs/common';
import { GoogleRoutesService } from './google-routes.service';
import { AmapRoutesService } from './amap-routes.service';
import { MapboxDirectionsService } from './mapbox-directions.service';
import { LocationDetectorService } from './location-detector.service';
import { RouteCacheService } from './route-cache.service';
import { encodePolyline } from '../utils/encoded-polyline.util';
import type {
  RouteGeometryInput,
  RouteGeometryProvider,
  RouteGeometryResult,
} from '../types/route-geometry.types';

const KNOWN_PROVIDERS = new Set<RouteGeometryProvider>(['GOOGLE', 'AMAP', 'MAPBOX', 'HEURISTIC']);

function normalizeCachedProvider(raw: unknown): RouteGeometryProvider {
  if (typeof raw === 'string' && KNOWN_PROVIDERS.has(raw as RouteGeometryProvider)) {
    return raw as RouteGeometryProvider;
  }
  return 'UNKNOWN';
}

@Injectable()
export class RouteGeometryService {
  private readonly logger = new Logger(RouteGeometryService.name);

  constructor(
    private readonly googleRoutes: GoogleRoutesService,
    private readonly amapRoutes: AmapRoutesService,
    private readonly mapboxDirections: MapboxDirectionsService,
    private readonly locationDetector: LocationDetectorService,
    private readonly routeCache: RouteCacheService,
  ) {}

  async resolveGeometry(input: RouteGeometryInput): Promise<RouteGeometryResult> {
    const from = input.from;
    const to = input.to;
    const travelMode = input.travelMode ?? 'DRIVING';

    if (input.cachedPolyline?.trim()) {
      const provider = normalizeCachedProvider(input.cachedProvider);
      return {
        polyline: input.cachedPolyline.trim(),
        geometrySource: 'cached_metadata',
        provider,
        cacheHit: true,
        fallbackUsed: provider === 'UNKNOWN',
        fallbackReason:
          provider === 'UNKNOWN' ? 'CACHED_POLYLINE_NO_PROVIDER' : undefined,
      };
    }

    const straightLine: RouteGeometryResult = {
      polyline: encodePolyline([
        { lat: from.lat, lng: from.lng },
        { lat: to.lat, lng: to.lng },
      ]),
      geometrySource: 'straight_line',
      provider: 'HEURISTIC',
      cacheHit: false,
      fallbackUsed: true,
      fallbackReason: 'STRAIGHT_LINE_NO_ROUTE_API',
    };

    if (input.useRouteApi === false) {
      return straightLine;
    }

    const cacheKeyMode = travelMode.toLowerCase();
    try {
      const cached = await this.routeCache.getCachedRoute(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        `geometry_${cacheKeyMode}`,
      );
      if (cached?.polyline) {
        const provider = normalizeCachedProvider(
          (cached as { provider?: RouteGeometryProvider }).provider,
        );
        return {
          polyline: cached.polyline,
          geometrySource: 'route_api',
          distanceMeters: cached.distanceMeters,
          durationMinutes: cached.durationMinutes,
          provider,
          cacheHit: true,
          fallbackUsed: provider === 'UNKNOWN',
          fallbackReason:
            provider === 'UNKNOWN' ? 'CACHE_ENTRY_MISSING_PROVIDER' : undefined,
          providerRequestId: (cached as { providerRequestId?: string }).providerRequestId,
        };
      }
    } catch {
      // ignore cache errors
    }

    const bothInChina = this.locationDetector.areBothInChina(
      from.lat,
      from.lng,
      to.lat,
      to.lng,
    );

    let resolved: RouteGeometryResult | null = null;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;

    if (bothInChina) {
      const amapMode =
        travelMode === 'WALKING' ? 'walking' : travelMode === 'TRANSIT' ? 'transit' : 'driving';
      const amap =
        amapMode === 'transit'
          ? null
          : await this.amapRoutes.computeRouteGeometry(
              from.lat,
              from.lng,
              to.lat,
              to.lng,
              amapMode as 'walking' | 'driving',
            );
      if (amap?.polyline) {
        resolved = {
          polyline: amap.polyline,
          geometrySource: 'route_api',
          distanceMeters: amap.distanceMeters,
          durationMinutes: amap.durationMinutes,
          provider: 'AMAP',
          cacheHit: false,
        };
      }
    }

    if (!resolved && !bothInChina) {
      const google = await this.googleRoutes.computeRouteGeometry(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        travelMode,
      );
      if (google?.polyline) {
        resolved = {
          polyline: google.polyline,
          geometrySource: 'route_api',
          distanceMeters: google.distanceMeters,
          durationMinutes: google.durationMinutes,
          provider: 'GOOGLE',
          cacheHit: false,
        };
      }
    }

    if (!resolved && !bothInChina) {
      const mapbox = await this.mapboxDirections.computeRouteGeometry(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        travelMode,
      );
      if (mapbox?.polyline) {
        fallbackUsed = true;
        fallbackReason = 'GOOGLE_EMPTY_FALLBACK_MAPBOX';
        resolved = {
          polyline: mapbox.polyline,
          geometrySource: 'route_api',
          distanceMeters: mapbox.distanceMeters,
          durationMinutes: mapbox.durationMinutes,
          provider: 'MAPBOX',
          cacheHit: false,
          fallbackUsed,
          fallbackReason,
        };
      }
    }

    if (!resolved) {
      return straightLine;
    }

    if (fallbackUsed && !resolved.fallbackUsed) {
      resolved = { ...resolved, fallbackUsed, fallbackReason };
    }

    try {
      await this.routeCache.saveCachedRoute(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        `geometry_${cacheKeyMode}`,
        {
          polyline: resolved.polyline,
          distanceMeters: resolved.distanceMeters,
          durationMinutes: resolved.durationMinutes,
          provider: resolved.provider,
          providerRequestId: resolved.providerRequestId,
          geometrySource: resolved.geometrySource,
        },
      );
    } catch (error) {
      this.logger.debug(`route geometry cache save failed: ${(error as Error).message}`);
    }

    return resolved;
  }
}
