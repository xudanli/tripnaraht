import { Injectable, Logger, Optional } from '@nestjs/common';
import { MapboxDirectionsService } from '../../../transport/services/mapbox-directions.service';
import { PersonalizedRouteProvider } from './personalized-route.provider';
import type {
  GeneratedRouteVariantBundle,
  RouteGenerationContext,
} from '../types/exploration-route-generation.types';
import type { RouteLineCoordinates } from '../config/iceland-route-detail.catalog';
import { ExplorationRouteGeometryCacheService } from '../services/exploration-route-geometry-cache.service';
import { densifyRouteMapGeometry } from '../utils/route-map-geometry.util';
import { decodePolyline } from '../utils/decode-polyline.util';

@Injectable()
export class EngineGeometryRouteProvider {
  private readonly logger = new Logger(EngineGeometryRouteProvider.name);
  /** 单次 generate 内 dedupe */
  private requestCache = new Map<string, RouteLineCoordinates>();

  constructor(
    private readonly personalizedProvider: PersonalizedRouteProvider,
    @Optional() private readonly mapbox?: MapboxDirectionsService,
    @Optional() private readonly geometryCache?: ExplorationRouteGeometryCacheService,
  ) {}

  async generate(ctx: RouteGenerationContext): Promise<GeneratedRouteVariantBundle[]> {
    this.requestCache.clear();
    const base = this.personalizedProvider.generate(ctx);
    if (!this.mapbox?.isConfigured()) {
      this.logger.warn('Mapbox not configured; ENGINE mode falls back to PERSONALIZED geometry');
      return base;
    }

    const results: GeneratedRouteVariantBundle[] = [];
    for (const variant of base) {
      if (!variant.routeDetail?.map?.mainLine?.length) {
        results.push(variant);
        continue;
      }
      const mainLine = await this.stitchMainLine(variant.routeDetail.map.mainLine);
      const map = densifyRouteMapGeometry({
        ...variant.routeDetail.map,
        mainLine,
      });
      results.push({
        ...variant,
        generationSource: 'ENGINE_MAPBOX',
        routeDetail: {
          ...variant.routeDetail,
          map,
        },
      });
    }
    return results;
  }

  private async stitchMainLine(anchors: RouteLineCoordinates): Promise<RouteLineCoordinates> {
    const stitched: RouteLineCoordinates = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [fromLng, fromLat] = anchors[i]!;
      const [toLng, toLat] = anchors[i + 1]!;
      const segment = await this.resolveSegment(fromLat, fromLng, toLat, toLng);
      for (let j = 0; j < segment.length; j++) {
        if (stitched.length > 0 && j === 0) continue;
        stitched.push(segment[j]!);
      }
    }
    return stitched.length > 1 ? stitched : anchors;
  }

  private async resolveSegment(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
  ): Promise<RouteLineCoordinates> {
    const key =
      this.geometryCache?.getSegmentKey(fromLng, fromLat, toLng, toLat) ??
      `${fromLng},${fromLat};${toLng},${toLat}`;

    const inRequest = this.requestCache.get(key);
    if (inRequest) return inRequest;

    const persisted = this.geometryCache?.get(key);
    if (persisted) {
      this.requestCache.set(key, persisted);
      return persisted;
    }

    const fetched = await this.fetchSegment(fromLat, fromLng, toLat, toLng);
    this.requestCache.set(key, fetched);
    this.geometryCache?.set(key, fetched);
    return fetched;
  }

  private async fetchSegment(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
  ): Promise<RouteLineCoordinates> {
    const seg = await this.mapbox!.computeRouteGeometry(fromLat, fromLng, toLat, toLng, 'DRIVING');
    if (seg?.polyline) {
      return decodePolyline(seg.polyline);
    }
    return [
      [fromLng, fromLat],
      [toLng, toLat],
    ];
  }
}
