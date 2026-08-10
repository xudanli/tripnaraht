/**
 * 高德住宿 POI 检索（国内兜底）。
 * 不替代 Airbnb / Google Places；仅在 CN 或中文国内目的地时由 hotel.search 降级调用。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export type AmapHotelSearchParams = {
  keywords?: string;
  location?: { lat: number; lng: number };
  city?: string;
  radiusMeters?: number;
  limit?: number;
};

export type AmapHotelResult = {
  placeId: string;
  name: string;
  address?: string;
  location: { lat: number; lng: number };
  rating?: number;
  types?: string[];
  phoneNumber?: string;
  provider: 'amap';
};

@Injectable()
export class AmapHotelService {
  private readonly logger = new Logger(AmapHotelService.name);
  private readonly apiKey: string | null;
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://restapi.amap.com/v3';

  constructor(@Optional() private readonly configService?: ConfigService) {
    const raw =
      this.configService?.get<string>('AMAP_API_KEY') ||
      process.env.AMAP_API_KEY ||
      '';
    this.apiKey = raw.replace(/^["']|["']$/g, '').trim() || null;
    this.axiosInstance = axios.create({
      timeout: 12_000,
      proxy: false,
      params: { key: this.apiKey || '' },
    });
  }

  isServiceAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * 搜索住宿类 POI（types=100000 住宿服务）。
   * 优先周边搜；无坐标时用关键字+城市文本搜。
   */
  async searchHotels(params: AmapHotelSearchParams): Promise<{
    success: boolean;
    results: AmapHotelResult[];
    totalResults: number;
    source: 'amap';
  }> {
    if (!this.apiKey) {
      throw new Error('高德 AMAP_API_KEY 未配置');
    }

    const limit = Math.min(Math.max(params.limit ?? 12, 1), 25);
    const keywords = (params.keywords || '酒店').trim() || '酒店';
    const radius = Math.min(Math.max(params.radiusMeters ?? 8000, 500), 50_000);

    let pois: any[] = [];
    if (params.location?.lat != null && params.location?.lng != null) {
      const around = await this.axiosInstance.get(`${this.baseUrl}/place/around`, {
        params: {
          location: `${params.location.lng},${params.location.lat}`,
          keywords,
          types: '100000',
          radius,
          offset: limit,
          page: 1,
          extensions: 'base',
        },
      });
      if (around.data?.status === '1' && Array.isArray(around.data.pois)) {
        pois = around.data.pois;
      } else {
        this.logger.debug(
          `高德周边搜无结果 status=${around.data?.status} info=${around.data?.info}`,
        );
      }
    }

    if (!pois.length) {
      const text = await this.axiosInstance.get(`${this.baseUrl}/place/text`, {
        params: {
          keywords,
          ...(params.city ? { city: params.city } : {}),
          types: '100000',
          offset: limit,
          page: 1,
          extensions: 'base',
        },
      });
      if (text.data?.status === '1' && Array.isArray(text.data.pois)) {
        pois = text.data.pois;
      } else {
        this.logger.debug(
          `高德文本搜无结果 status=${text.data?.status} info=${text.data?.info}`,
        );
      }
    }

    const results = pois
      .map((poi) => this.mapPoi(poi))
      .filter((r): r is AmapHotelResult => r != null)
      .slice(0, limit);

    return {
      success: true,
      results,
      totalResults: results.length,
      source: 'amap',
    };
  }

  private mapPoi(poi: any): AmapHotelResult | null {
    if (!poi?.location || !poi?.name) return null;
    const [lngRaw, latRaw] = String(poi.location).split(',');
    const lng = Number(lngRaw);
    const lat = Number(latRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      placeId: String(poi.id || `amap-${poi.name}`),
      name: String(poi.name),
      ...(poi.address ? { address: String(poi.address) } : {}),
      location: { lat, lng },
      types: String(poi.type || '')
        .split(';')
        .map((s: string) => s.trim())
        .filter(Boolean),
      ...(poi.tel ? { phoneNumber: String(poi.tel) } : {}),
      provider: 'amap',
    };
  }
}
