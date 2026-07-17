/**
 * DEM profile from travel-eta geometry (encoded polyline).
 * Bridge: Route L1 geometry → DEM Gate 2 terrain summary.
 */

import { Injectable, Logger } from '@nestjs/common';
import { decodePolyline } from '../../../transport/utils/encoded-polyline.util';
import type {
  TravelRouteGeometryV1,
  TravelSegmentTerrainV1,
} from '../../../transport/contracts/travel-eta.contract';
import { DEMEffortMetadataService } from './dem-effort-metadata.service';
import {
  DEMElevationService,
  type DemRasterSource,
} from './dem-elevation.service';

export interface DemProfileFromGeometryInput {
  geometry: TravelRouteGeometryV1;
  /** Sampling interval along route (meters). Default 100. */
  sampleIntervalM?: number;
  activityType?: 'walking' | 'driving' | 'cycling';
  /** Cap vertex count after decode+resample (default 200) */
  maxSamples?: number;
}

@Injectable()
export class DemProfileFromGeometryService {
  private readonly logger = new Logger(DemProfileFromGeometryService.name);

  constructor(
    private readonly demEffort: DEMEffortMetadataService,
    private readonly demElevation: DEMElevationService,
  ) {}

  async profile(input: DemProfileFromGeometryInput): Promise<TravelSegmentTerrainV1 | null> {
    const points = this.geometryToPoints(input.geometry);
    if (points.length < 2) {
      this.logger.debug('DEM profile skipped: geometry yielded <2 points');
      return null;
    }

    const sampleIntervalM = input.sampleIntervalM ?? 100;
    const maxSamples = input.maxSamples ?? 200;
    const sampled = resampleAlongRoute(points, sampleIntervalM, maxSamples);

    const effort = await this.demEffort.calculateEffortMetadata(sampled, {
      activityType: input.activityType ?? 'driving',
      samplingInterval: sampleIntervalM,
      includeElevationProfile: false,
    });

    const mid = sampled[Math.floor(sampled.length / 2)] ?? sampled[0];
    const provenance = await this.demElevation.getElevationWithProvenance(mid.lat, mid.lng);

    return {
      ascentM: Math.round(effort.totalAscent),
      descentM: Math.round(effort.totalDescent),
      avgSlopePct: Math.round(effort.avgSlope * 10) / 10,
      maxSlopePct: Math.round(effort.maxSlope * 10) / 10,
      sampleCount: sampled.length,
      demSource: provenance.source,
      resolutionM: provenance.resolutionM ?? undefined,
      srid: provenance.srid ?? undefined,
      confidence: provenance.confidence,
      geometrySource: input.geometry.source,
    };
  }

  private geometryToPoints(geometry: TravelRouteGeometryV1): Array<{ lat: number; lng: number }> {
    if (geometry.encoding === 'NONE' || !geometry.value?.trim()) {
      return [];
    }
    if (geometry.encoding === 'ENCODED_POLYLINE') {
      return decodePolyline(geometry.value.trim());
    }
    // GEOJSON_LINESTRING — minimal parse of coordinates array
    try {
      const parsed = JSON.parse(geometry.value) as {
        type?: string;
        coordinates?: number[][];
      };
      if (Array.isArray(parsed.coordinates)) {
        return parsed.coordinates
          .map((c) => ({ lng: Number(c[0]), lat: Number(c[1]) }))
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      }
    } catch {
      this.logger.debug('Failed to parse GEOJSON_LINESTRING geometry');
    }
    return [];
  }
}

/** Evenly sample along polyline by cumulative haversine distance. */
export function resampleAlongRoute(
  points: Array<{ lat: number; lng: number }>,
  intervalM: number,
  maxSamples: number,
): Array<{ lat: number; lng: number }> {
  if (points.length < 2) return points;
  const out: Array<{ lat: number; lng: number }> = [{ ...points[0] }];
  let acc = 0;
  let nextAt = intervalM;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segLen = haversineM(a, b);
    if (segLen <= 0) continue;
    let consumed = 0;
    while (acc + (segLen - consumed) >= nextAt && out.length < maxSamples) {
      const t = (nextAt - acc) / segLen;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      });
      nextAt += intervalM;
      consumed = nextAt - intervalM - acc;
    }
    acc += segLen;
  }

  const last = points[points.length - 1];
  const prev = out[out.length - 1];
  if (!prev || prev.lat !== last.lat || prev.lng !== last.lng) {
    out.push({ ...last });
  }
  return out.slice(0, maxSamples);
}

function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isHighConfidenceIcelandDem(source: DemRasterSource): boolean {
  return source === 'geo_dem_iceland_20m';
}
