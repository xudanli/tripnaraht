/**
 * Mapbox Directions API — journey-map 海外贴路几何
 * @see https://docs.mapbox.com/api/navigation/directions/
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

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
    this.accessToken =
      this.configService?.get<string>('MAPBOX_ACCESS_TOKEN') ??
      this.configService?.get<string>('VITE_MAPBOX_ACCESS_TOKEN') ??
      this.configService?.get<string>('MAPBOX_API_KEY') ??
      process.env.MAPBOX_ACCESS_TOKEN ??
      process.env.VITE_MAPBOX_ACCESS_TOKEN ??
      process.env.MAPBOX_API_KEY ??
      '';

    this.axiosInstance = axios.create({
      baseURL: 'https://api.mapbox.com',
      timeout: 15_000,
      proxy: false,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken?.trim());
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

      const route = response.data?.routes?.[0];
      const polyline = route?.geometry;
      if (typeof polyline !== 'string' || !polyline.trim()) {
        return null;
      }

      const distanceMeters = Math.round(Number(route.distance) || 0);
      const durationMinutes = Math.max(1, Math.round((Number(route.duration) || 0) / 60));

      return {
        polyline: polyline.trim(),
        distanceMeters,
        durationMinutes,
      };
    } catch (error) {
      this.logger.debug(
        `Mapbox Directions failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private resolveProfile(travelMode: 'DRIVING' | 'WALKING' | 'TRANSIT'): string {
    if (travelMode === 'WALKING') return 'walking';
    return 'driving';
  }
}
