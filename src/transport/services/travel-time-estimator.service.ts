// src/transport/services/travel-time-estimator.service.ts
import { Injectable } from '@nestjs/common';
import { haversineDistanceKm } from '../utils/geo-distance.util';
import { estimateIcelandCoordinateTravelTime } from '../utils/iceland-coordinate-travel-time.util';

export type PoiTravelMode = 'WALKING' | 'DRIVING' | 'TRANSIT';

export interface PoiTravelEstimate {
  distanceKm: number;
  durationMinutes: number;
  travelMode: PoiTravelMode;
}

/**
 * 统一交通时间估算服务
 *
 * 供 getDayTravelInfo（行程交通信息）、getConflicts（冲突检测）、
 * 路线模板排程与 transport.search POI 跳点降级共用。
 *
 * 估算公式：
 * - WALKING: 5 km/h
 * - DRIVING: 60 km/h
 * - TRANSIT: 80 km/h（公交/长途）
 */
@Injectable()
export class TravelTimeEstimatorService {
  haversineDistanceKm(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): number {
    return haversineDistanceKm(from, to);
  }

  /**
   * POI 间交通估算（直线距离 + 模式推断）。
   * 默认按自驾/包车场景：>1 km 一律 DRIVING，避免 >50 km 误判为城际公交。
   */
  estimatePoiTravelMinutes(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    options?: { travelMode?: PoiTravelMode; defaultDriving?: boolean; countryCode?: string; travelDate?: Date },
  ): PoiTravelEstimate {
    const distanceKm = this.haversineDistanceKm(from, to);
    const defaultDriving = options?.defaultDriving !== false;
    const travelMode =
      options?.travelMode ??
      (distanceKm < 1
        ? 'WALKING'
        : defaultDriving
          ? 'DRIVING'
          : this.inferTravelMode(distanceKm));

    if (travelMode === 'DRIVING' && (!options?.countryCode || options.countryCode.toUpperCase() === 'IS')) {
      const icelandEstimate = estimateIcelandCoordinateTravelTime(from, to, { travelDate: options?.travelDate });
      if (icelandEstimate.applies) {
        return {
          distanceKm: icelandEstimate.distanceKm,
          durationMinutes: icelandEstimate.durationMinutes,
          travelMode,
        };
      }
    }

    return {
      distanceKm,
      durationMinutes: this.estimateDurationMinutes(distanceKm, travelMode),
      travelMode,
    };
  }

  /**
   * 根据直线距离推断交通方式（通用场景，含公交偏好）
   */
  inferTravelMode(distanceKm: number): PoiTravelMode {
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
