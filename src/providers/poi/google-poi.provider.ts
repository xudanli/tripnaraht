// src/providers/poi/google-poi.provider.ts

import { Injectable, Logger } from '@nestjs/common';
import { PoiProvider } from './poi.provider.interface';
import { PoiCandidate } from '../../assist/dto/action.dto';

/**
 * Google Places API POI 提供者
 * 
 * 使用 Google Places API 进行 POI 搜索
 */
@Injectable()
export class GooglePoiProvider implements PoiProvider {
  private readonly logger = new Logger(GooglePoiProvider.name);
  private readonly apiKey: string | undefined;
  private readonly enabled: boolean;

  constructor() {
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
    this.enabled = !!this.apiKey;
    
    if (!this.enabled) {
      this.logger.warn('GooglePoiProvider: GOOGLE_PLACES_API_KEY not set, provider disabled');
    }
  }

  async textSearch(args: {
    query: string;
    lat: number;
    lng: number;
    radiusM?: number;
    language?: string;
    types?: string[];
  }): Promise<PoiCandidate[]> {
    if (!this.enabled) {
      throw new Error('GooglePoiProvider is not enabled (missing API key)');
    }

    try {
      const { query, lat, lng, radiusM = 1000, language = 'zh-CN' } = args;

      // 调用 Google Places API Text Search
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?` +
        `query=${encodeURIComponent(query)}` +
        `&location=${lat},${lng}` +
        `&radius=${radiusM}` +
        `&language=${language}` +
        `&key=${this.apiKey}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Places API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API returned status: ${data.status}`);
      }

      if (!data.results || data.results.length === 0) {
        return [];
      }

      // 转换为 PoiCandidate 格式
      return data.results.map((place: any) => {
        const placeLocation = place.geometry?.location;
        const distanceM = placeLocation
          ? this.calculateDistance(lat, lng, placeLocation.lat, placeLocation.lng)
          : undefined;

        return {
          id: place.place_id,
          name: place.name,
          nameCN: place.name,
          nameEN: place.name,
          lat: placeLocation?.lat || lat,
          lng: placeLocation?.lng || lng,
          distanceM,
          rating: place.rating,
          isOpenNow: place.opening_hours?.open_now,
          address: place.formatted_address,
          tags: place.types || [],
          matchScore: this.calculateMatchScore(query, place.name, place.formatted_address),
        };
      });
    } catch (error: any) {
      this.logger.error(`Google POI search error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async nearbySearch?(args: {
    lat: number;
    lng: number;
    radiusM?: number;
    type?: string;
    keyword?: string;
    language?: string;
  }): Promise<PoiCandidate[]> {
    if (!this.enabled) {
      throw new Error('GooglePoiProvider is not enabled (missing API key)');
    }

    try {
      const { lat, lng, radiusM = 1000, type, keyword, language = 'zh-CN' } = args;

      let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
        `location=${lat},${lng}` +
        `&radius=${radiusM}` +
        `&language=${language}` +
        `&key=${this.apiKey}`;

      if (type) {
        url += `&type=${type}`;
      }

      if (keyword) {
        url += `&keyword=${encodeURIComponent(keyword)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Places API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API returned status: ${data.status}`);
      }

      if (!data.results || data.results.length === 0) {
        return [];
      }

      // 转换为 PoiCandidate 格式
      return data.results.map((place: any) => {
        const placeLocation = place.geometry?.location;
        const distanceM = placeLocation
          ? this.calculateDistance(lat, lng, placeLocation.lat, placeLocation.lng)
          : undefined;

        return {
          id: place.place_id,
          name: place.name,
          nameCN: place.name,
          nameEN: place.name,
          lat: placeLocation?.lat || lat,
          lng: placeLocation?.lng || lng,
          distanceM,
          rating: place.rating,
          isOpenNow: place.opening_hours?.open_now,
          address: place.vicinity || place.formatted_address,
          tags: place.types || [],
          matchScore: keyword ? this.calculateMatchScore(keyword, place.name) : 0.5,
        };
      });
    } catch (error: any) {
      this.logger.error(`Google POI nearby search error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 计算两点之间的距离（米）
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // 地球半径（米）
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 计算文本匹配分数
   */
  private calculateMatchScore(query: string, name: string, address?: string): number {
    const queryLower = query.toLowerCase();
    const nameLower = name.toLowerCase();
    const addressLower = address?.toLowerCase() || '';

    // 名称完全匹配
    if (nameLower === queryLower) {
      return 1.0;
    }

    // 名称包含查询词
    if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
      return 0.8;
    }

    // 地址包含查询词
    if (addressLower.includes(queryLower)) {
      return 0.6;
    }

    // 部分匹配
    const queryWords = queryLower.split(/\s+/);
    const nameWords = nameLower.split(/\s+/);
    const matchingWords = queryWords.filter((qw) =>
      nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))
    );

    if (matchingWords.length > 0) {
      return 0.4 * (matchingWords.length / queryWords.length);
    }

    return 0.2; // 默认低匹配度
  }
}
