import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { isLikelyIcelandCoordinate } from '../utils/iceland-coordinate-travel-time.util';

export type SelfHostedRoutingEngine = 'osrm' | 'graphhopper';

export interface SelfHostedRouteEstimate {
  engine: SelfHostedRoutingEngine;
  durationMinutes: number;
  distanceMeters?: number;
}

export interface SelfHostedRouteRequest {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  mode: 'DRIVE' | 'WALK' | 'TRANSIT' | string;
}

@Injectable()
export class SelfHostedRoutingService {
  private readonly logger = new Logger(SelfHostedRoutingService.name);
  private readonly http: AxiosInstance;

  constructor(@Optional() private readonly config?: ConfigService) {
    this.http = axios.create({
      timeout: Number(this.config?.get('SELF_HOSTED_ROUTING_TIMEOUT_MS') ?? 5000),
      proxy: false,
    });
  }

  async estimateTravelMinutes(request: SelfHostedRouteRequest): Promise<SelfHostedRouteEstimate | null> {
    const mode = String(request.mode ?? 'DRIVE').toUpperCase();
    if (mode !== 'DRIVE') return null;

    if (!this.shouldUseSelfHostedRouting(request)) return null;

    const engine = this.resolveEngine();
    if (engine === 'osrm') {
      return this.estimateWithOsrm(request);
    }
    if (engine === 'graphhopper') {
      return this.estimateWithGraphHopper(request);
    }

    const osrm = await this.estimateWithOsrm(request);
    if (osrm) return osrm;
    return this.estimateWithGraphHopper(request);
  }

  private shouldUseSelfHostedRouting(request: SelfHostedRouteRequest): boolean {
    const scope = String(this.config?.get('SELF_HOSTED_ROUTING_SCOPE') ?? 'iceland').toLowerCase();
    if (scope === 'all') return true;
    return isLikelyIcelandCoordinate(request.from) && isLikelyIcelandCoordinate(request.to);
  }

  private resolveEngine(): SelfHostedRoutingEngine | 'auto' {
    const raw = String(this.config?.get('SELF_HOSTED_ROUTING_ENGINE') ?? 'auto').toLowerCase();
    if (raw === 'osrm' || raw === 'graphhopper') return raw;
    return 'auto';
  }

  private osrmBaseUrl(): string | null {
    const raw = String(this.config?.get('OSRM_BASE_URL') ?? this.config?.get('ICELAND_OSRM_BASE_URL') ?? '').trim();
    return raw ? raw.replace(/\/$/, '') : null;
  }

  private graphHopperBaseUrl(): string | null {
    const raw = String(this.config?.get('GRAPHHOPPER_BASE_URL') ?? this.config?.get('ICELAND_GRAPHHOPPER_BASE_URL') ?? '').trim();
    return raw ? raw.replace(/\/$/, '') : null;
  }

  private async estimateWithOsrm(request: SelfHostedRouteRequest): Promise<SelfHostedRouteEstimate | null> {
    const baseUrl = this.osrmBaseUrl();
    if (!baseUrl) return null;

    try {
      const coords = `${request.from.lng},${request.from.lat};${request.to.lng},${request.to.lat}`;
      const response = await this.http.get(`${baseUrl}/route/v1/driving/${coords}`, {
        params: {
          overview: 'false',
          alternatives: 'false',
          steps: 'false',
        },
      });
      const route = response.data?.routes?.[0];
      const seconds = Number(route?.duration);
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      const distanceMeters = Number(route?.distance);
      return {
        engine: 'osrm',
        durationMinutes: Math.max(1, Math.round(seconds / 60)),
        ...(Number.isFinite(distanceMeters) ? { distanceMeters } : {}),
      };
    } catch (error: any) {
      this.logger.debug(`OSRM route lookup failed: ${error?.message ?? error}`);
      return null;
    }
  }

  private async estimateWithGraphHopper(request: SelfHostedRouteRequest): Promise<SelfHostedRouteEstimate | null> {
    const baseUrl = this.graphHopperBaseUrl();
    if (!baseUrl) return null;

    try {
      const apiKey = String(this.config?.get('GRAPHHOPPER_API_KEY') ?? this.config?.get('ICELAND_GRAPHHOPPER_API_KEY') ?? '').trim();
      const params = new URLSearchParams();
      params.append('point', `${request.from.lat},${request.from.lng}`);
      params.append('point', `${request.to.lat},${request.to.lng}`);
      params.append('profile', String(this.config?.get('GRAPHHOPPER_PROFILE') ?? 'car'));
      params.append('points_encoded', 'false');
      params.append('calc_points', 'false');
      params.append('instructions', 'false');
      if (apiKey) params.append('key', apiKey);

      const response = await this.http.get(`${baseUrl}/route`, { params });
      const path = response.data?.paths?.[0];
      const millis = Number(path?.time);
      if (!Number.isFinite(millis) || millis <= 0) return null;
      const distanceMeters = Number(path?.distance);
      return {
        engine: 'graphhopper',
        durationMinutes: Math.max(1, Math.round(millis / 60_000)),
        ...(Number.isFinite(distanceMeters) ? { distanceMeters } : {}),
      };
    } catch (error: any) {
      this.logger.debug(`GraphHopper route lookup failed: ${error?.message ?? error}`);
      return null;
    }
  }
}
