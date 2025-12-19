// src/trips/decision/adapters/sense-tools.adapter.ts

/**
 * Sense Tools Adapter
 * 
 * 将现有的服务适配到决策引擎的 SenseTools 接口
 */

import { Injectable } from '@nestjs/common';
import { SmartRoutesService } from '../../../transport/services/smart-routes.service';
import { TravelLeg, GeoPoint } from '../world-model';
import { SenseTools } from '../trip-decision-engine.service';

@Injectable()
export class SenseToolsAdapter implements SenseTools {
  constructor(private readonly smartRoutesService: SmartRoutesService) {}

  /**
   * 获取酒店位置（从 Trip 的 anchors 中获取，这里提供接口）
   * 实际实现可以从 TripService 中获取
   */
  async getHotelPointForDate(date: string): Promise<GeoPoint | undefined> {
    // TODO: 从 TripService 获取该日期的酒店位置
    // 这里先返回 undefined，由调用方提供
    return undefined;
  }

  /**
   * 获取两点之间的旅行时间
   */
  async getTravelLeg(from: GeoPoint, to: GeoPoint): Promise<TravelLeg> {
    try {
      // 使用智能路由服务获取路线
      const options = await this.smartRoutesService.getRoutes(
        from.lat,
        from.lng,
        to.lat,
        to.lng,
        'DRIVING' // 默认使用驾车模式，可以根据上下文调整
      );

      if (options.length > 0) {
        const bestOption = options[0];
        return {
          mode: this.mapTransportMode(bestOption.mode),
          from,
          to,
          durationMin: bestOption.durationMinutes,
          distanceKm: bestOption.walkDistance
            ? bestOption.walkDistance / 1000
            : undefined,
          reliability: 0.9, // 基于 API 返回的可靠性
          source: 'smart_routes',
        };
      }

      // 降级：使用距离估算
      return this.fallbackEstimate(from, to);
    } catch (error) {
      // 降级：使用距离估算
      return this.fallbackEstimate(from, to);
    }
  }

  /**
   * 映射交通模式
   */
  private mapTransportMode(
    mode: string | any
  ): 'walk' | 'drive' | 'transit' | 'rideshare' | 'bike' | 'unknown' {
    const modeStr = String(mode).toUpperCase();
    switch (modeStr) {
      case 'WALKING':
        return 'walk';
      case 'DRIVING':
      case 'TAXI':
        return 'drive';
      case 'TRANSIT':
        return 'transit';
      default:
        return 'unknown';
    }
  }

  /**
   * 降级估算（基于距离）
   */
  private fallbackEstimate(from: GeoPoint, to: GeoPoint): TravelLeg {
    // 简单的 Haversine 距离计算
    const distanceKm = this.calculateDistance(from, to);
    // 假设平均速度 50 km/h
    const durationMin = Math.round((distanceKm / 50) * 60);

    return {
      mode: 'drive',
      from,
      to,
      durationMin: Math.max(durationMin, 5), // 至少 5 分钟
      distanceKm,
      reliability: 0.5, // 降级估算的可靠性较低
      source: 'heuristic',
    };
  }

  /**
   * 计算两点之间的距离（公里）
   * 使用 Haversine 公式
   */
  private calculateDistance(from: GeoPoint, to: GeoPoint): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRad(to.lat - from.lat);
    const dLon = this.toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) *
        Math.cos(this.toRad(to.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}

