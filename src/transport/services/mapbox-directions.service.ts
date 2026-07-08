/**
 * Mapbox Directions API — journey-map 海外贴路几何
 * @see https://docs.mapbox.com/api/navigation/directions/
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { TransportMode, TransportOption } from '../interfaces/transport.interface';

export interface MapboxRouteGeometryResult {
  polyline: string;
  distanceMeters: number;
  durationMinutes: number;
}

@Injectable()
export class MapboxDirectionsService {
  private readonly logger = new Logger(MapboxDirectionsService.name);
  private readonly accessToken: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.accessToken = this.resolveAccessToken();

    this.axiosInstance = axios.create({
      baseURL: 'https://api.mapbox.com',
      timeout: 15_000,
      proxy: false,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken?.trim());
  }

  /** 跳过空字符串，避免 MAPBOX_ACCESS_TOKEN= 阻断 VITE_MAPBOX 回退 */
  private resolveAccessToken(): string {
    const candidates = [
      this.configService?.get<string>('MAPBOX_ACCESS_TOKEN'),
      this.configService?.get<string>('VITE_MAPBOX_ACCESS_TOKEN'),
      this.configService?.get<string>('MAPBOX_API_KEY'),
      process.env.MAPBOX_ACCESS_TOKEN,
      process.env.VITE_MAPBOX_ACCESS_TOKEN,
      process.env.MAPBOX_API_KEY,
    ];
    for (const raw of candidates) {
      const token = raw?.trim();
      if (token) return token;
    }
    return '';
  }

  async computeRouteGeometry(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: 'DRIVING' | 'WALKING' | 'TRANSIT' = 'DRIVING',
  ): Promise<MapboxRouteGeometryResult | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const profile = this.resolveProfile(travelMode);
    const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`;

    try {
      const response = await this.axiosInstance.get(
        `/directions/v5/mapbox/${profile}/${coordinates}.json`,
        {
          params: {
            access_token: this.accessToken,
            geometries: 'polyline',
            overview: 'full',
            steps: false,
          },
        },
      );

      return this.parseRouteResponse(response.data);
    } catch (error) {
      this.logger.debug(
        `Mapbox Directions failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * 与 SmartRoutes / Google Routes 对齐的交通选项（Google 失败时的海外降级）。
   */
  async getRoutes(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING' = 'DRIVING',
  ): Promise<TransportOption[]> {
    const geometry = await this.computeRouteGeometry(
      fromLat,
      fromLng,
      toLat,
      toLng,
      travelMode,
    );
    if (!geometry) return [];

    const mode =
      travelMode === 'WALKING'
        ? TransportMode.WALKING
        : travelMode === 'TRANSIT'
          ? TransportMode.TRANSIT
          : TransportMode.TAXI;

    return [
      {
        mode,
        durationMinutes: geometry.durationMinutes,
        cost: travelMode === 'WALKING' ? 0 : this.estimateDrivingCost(geometry.distanceMeters),
        walkDistance: travelMode === 'WALKING' ? geometry.distanceMeters : 0,
        description:
          travelMode === 'TRANSIT'
            ? 'Mapbox 驾车估算（公共交通不可用时的降级）'
            : 'Mapbox Directions',
        recommendationReason: 'Google Routes 不可用，已降级 Mapbox',
      },
    ];
  }

  private parseRouteResponse(data: unknown): MapboxRouteGeometryResult | null {
    const route = (data as { routes?: Array<{ geometry?: string; distance?: number; duration?: number }> })
      ?.routes?.[0];
    const polyline = route?.geometry;
    if (typeof polyline !== 'string' || !polyline.trim()) {
      return null;
    }

    const distanceMeters = Math.round(Number(route!.distance) || 0);
    const durationMinutes = Math.max(1, Math.round((Number(route!.duration) || 0) / 60));

    return {
      polyline: polyline.trim(),
      distanceMeters,
      durationMinutes,
    };
  }

  private estimateDrivingCost(distanceMeters: number): number {
    const km = distanceMeters / 1000;
    return Math.max(0, Math.round(km * 2.5 * 100) / 100);
  }

  private resolveProfile(travelMode: 'DRIVING' | 'WALKING' | 'TRANSIT'): string {
    if (travelMode === 'WALKING') return 'walking';
    return 'driving';
  }
}
