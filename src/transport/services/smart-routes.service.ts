// src/transport/services/smart-routes.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { GoogleRoutesService } from './google-routes.service';
import { AmapRoutesService } from './amap-routes.service';
import { MapboxDirectionsService } from './mapbox-directions.service';
import { LocationDetectorService } from './location-detector.service';
import {
  TransportOption,
  type TransportRouteProvider,
} from '../interfaces/transport.interface';

/**
 * 智能路线服务
 *
 * 根据地理位置自动选择合适的地图 API：
 * - 国内：高德 → Google → Mapbox
 * - 海外：Google → Mapbox
 */
@Injectable()
export class SmartRoutesService {
  private readonly logger = new Logger(SmartRoutesService.name);
  private lastOverseasRouteLogAt = 0;

  constructor(
    private googleRoutesService: GoogleRoutesService,
    private amapRoutesService: AmapRoutesService,
    private locationDetector: LocationDetectorService,
    @Optional() private mapboxDirectionsService?: MapboxDirectionsService,
  ) {}

  async getRoutes(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING' = 'TRANSIT',
    preferences?: {
      lessWalking?: boolean;
      avoidHighways?: boolean;
      avoidTolls?: boolean;
    },
  ): Promise<TransportOption[]> {
    const bothInChina = this.locationDetector.areBothInChina(
      fromLat,
      fromLng,
      toLat,
      toLng,
    );

    const bothOverseas = this.locationDetector.areBothOverseas(
      fromLat,
      fromLng,
      toLat,
      toLng,
    );

    if (!bothInChina && !bothOverseas) {
      this.logger.warn('跨区域路线（中国↔海外），使用 Google Routes → Mapbox 降级');
      return this.getGoogleRoutesWithMapboxFallback(
        fromLat,
        fromLng,
        toLat,
        toLng,
        travelMode,
        preferences,
      );
    }

    if (bothInChina) {
      this.logger.debug('使用高德地图 API（国内路线）');

      const amapMode = this.convertTravelModeToAmap(travelMode);
      const options = await this.amapRoutesService.getRoutes(
        fromLat,
        fromLng,
        toLat,
        toLng,
        amapMode,
        preferences,
      );

      if (options.length > 0) {
        return this.tagProvider(options, 'AMAP', { fallbackUsed: false });
      }

      this.logger.warn('高德地图 API 无结果，降级 Google Routes → Mapbox');
      const fallback = await this.getGoogleRoutesWithMapboxFallback(
        fromLat,
        fromLng,
        toLat,
        toLng,
        travelMode,
        preferences,
      );
      return fallback.map((opt) => ({
        ...opt,
        fallbackUsed: true,
        fallbackReason: opt.fallbackReason ?? 'AMAP_EMPTY_FALLBACK_GOOGLE_OR_MAPBOX',
      }));
    }

    const now = Date.now();
    if (now - this.lastOverseasRouteLogAt > 15000) {
      this.lastOverseasRouteLogAt = now;
      this.logger.debug('使用 Google Routes API（海外路线），失败时降级 Mapbox');
    }

    return this.getGoogleRoutesWithMapboxFallback(
      fromLat,
      fromLng,
      toLat,
      toLng,
      travelMode,
      preferences,
    );
  }

  private async getGoogleRoutesWithMapboxFallback(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING',
    preferences?: {
      lessWalking?: boolean;
      avoidHighways?: boolean;
      avoidTolls?: boolean;
    },
  ): Promise<TransportOption[]> {
    const googleOptions = await this.googleRoutesService.getRoutes(
      fromLat,
      fromLng,
      toLat,
      toLng,
      travelMode,
      preferences,
    );
    if (googleOptions.length > 0) {
      return this.tagProvider(googleOptions, 'GOOGLE', {
        fallbackUsed: false,
      });
    }

    if (!this.mapboxDirectionsService?.isConfigured()) {
      return [];
    }

    this.logger.warn('Google Routes 无结果，降级使用 Mapbox Directions');
    const mapboxOptions = await this.mapboxDirectionsService.getRoutes(
      fromLat,
      fromLng,
      toLat,
      toLng,
      travelMode,
    );
    return this.tagProvider(mapboxOptions, 'MAPBOX', {
      fallbackUsed: true,
      fallbackReason: 'GOOGLE_EMPTY_FALLBACK_MAPBOX',
    });
  }

  private tagProvider(
    options: TransportOption[],
    provider: TransportRouteProvider,
    meta?: { fallbackUsed?: boolean; fallbackReason?: string },
  ): TransportOption[] {
    return options.map((opt) => ({
      ...opt,
      // Always stamp — never leave UNKNOWN on a known Directions path
      routeProvider: provider,
      fallbackUsed: meta?.fallbackUsed ?? opt.fallbackUsed,
      fallbackReason: meta?.fallbackReason ?? opt.fallbackReason,
    }));
  }

  private convertTravelModeToAmap(
    mode: 'TRANSIT' | 'WALKING' | 'DRIVING',
  ): 'transit' | 'walking' | 'driving' {
    switch (mode) {
      case 'TRANSIT':
        return 'transit';
      case 'WALKING':
        return 'walking';
      case 'DRIVING':
        return 'driving';
      default:
        return 'transit';
    }
  }
}
