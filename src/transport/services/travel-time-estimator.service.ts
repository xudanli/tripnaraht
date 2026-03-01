// src/transport/services/travel-time-estimator.service.ts
import { Injectable } from '@nestjs/common';

/**
 * 统一交通时间估算服务
 *
 * 供 getDayTravelInfo（行程交通信息）与 getConflicts（冲突检测）共用，
 * 确保两处展示的交通时间、交通方式、缓冲逻辑一致。
 *
 * 估算公式（与 ItineraryItemsService 保持一致）：
 * - WALKING: 5 km/h
 * - DRIVING: 60 km/h
 * - TRANSIT: 80 km/h（公交/长途）
 */
@Injectable()
export class TravelTimeEstimatorService {
  /**
   * 根据直线距离推断交通方式
   */
  inferTravelMode(distanceKm: number): 'WALKING' | 'DRIVING' | 'TRANSIT' {
    if (distanceKm < 2) return 'WALKING';
    if (distanceKm < 50) return 'DRIVING';
    return 'TRANSIT';
  }

  /**
   * 根据距离和交通方式估算时间（分钟）
   * 与 ItineraryItemsService.estimateDuration 保持一致
   */
  estimateDurationMinutes(distanceKm: number, travelMode: string): number {
    switch (travelMode) {
      case 'WALKING':
        return Math.round((distanceKm / 5) * 60); // 5 km/h
      case 'BICYCLE':
        return Math.round((distanceKm / 15) * 60); // 15 km/h
      case 'DRIVING':
      case 'TAXI':
        return Math.round((distanceKm / 60) * 60); // 60 km/h
      case 'TRANSIT':
      case 'BUS':
        return Math.round((distanceKm / 80) * 60); // 80 km/h（与时间轴一致）
      case 'TRAIN':
        return Math.round((distanceKm / 250) * 60) + 60;
      case 'FLIGHT':
        return Math.round((distanceKm / 800) * 60) + 180;
      case 'FERRY':
        return Math.round((distanceKm / 30) * 60) + 30;
      default:
        return Math.round((distanceKm / 50) * 60); // 默认 50 km/h
    }
  }

  /**
   * 根据距离估算交通时间（无显式 mode 时，按距离推断）
   */
  estimateFromDistance(distanceKm: number): number {
    const mode = this.inferTravelMode(distanceKm);
    return this.estimateDurationMinutes(distanceKm, mode);
  }
}
