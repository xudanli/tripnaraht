// src/itinerary-items/validators/travel-time.validator.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BaseValidator } from './base.validator';
import { 
  ValidationCode, 
  ValidationSeverity, 
  ValidationResult, 
  ValidationContext,
  TravelInfo
} from '../interfaces/validation.interface';
import { SmartRoutesService } from '../../transport/services/smart-routes.service';
import { TravelTimeCacheService } from '../services/travel-time-cache.service';
import { DateTime } from 'luxon';

/**
 * 交通时间校验器
 * 
 * 检测从前一个行程项到新行程项是否有足够的交通时间
 * 严重程度：WARNING（可被 forceCreate 覆盖）
 */
@Injectable()
export class TravelTimeValidator extends BaseValidator {
  private readonly logger = new Logger(TravelTimeValidator.name);
  
  /** 最小缓冲时间（分钟） */
  private readonly MIN_BUFFER_MINUTES = 15;

  constructor(
    @Optional() private readonly smartRoutesService?: SmartRoutesService,
    @Optional() private readonly cacheService?: TravelTimeCacheService
  ) {
    super();
  }

  getCode(): ValidationCode {
    return ValidationCode.INSUFFICIENT_TRAVEL_TIME;
  }

  getSeverity(): ValidationSeverity {
    return ValidationSeverity.WARNING;
  }

  async validate(context: ValidationContext): Promise<ValidationResult | null> {
    const { newItem, previousItem, newItemPlace } = context;

    // 如果没有前序行程项，跳过校验
    if (!previousItem) {
      return this.pass();
    }

    // 如果新项或前项没有地点信息，跳过校验
    if (!newItemPlace?.coordinates || !previousItem.place?.coordinates) {
      return this.pass();
    }

    const fromCoords = previousItem.place.coordinates;
    const toCoords = newItemPlace.coordinates;

    // 计算可用时间
    const prevEnd = DateTime.fromJSDate(previousItem.endTime);
    const newStart = DateTime.fromJSDate(newItem.startTime);
    const availableMinutes = newStart.diff(prevEnd, 'minutes').minutes;

    // 如果可用时间为负（时间顺序错误），交给 TimeOverlapValidator 处理
    if (availableMinutes < 0) {
      return this.pass();
    }

    // 计算交通时间
    const travelInfo = await this.calculateTravelTime(
      fromCoords.lat,
      fromCoords.lng,
      toCoords.lat,
      toCoords.lng,
      previousItem.place.name || '前一地点',
      newItemPlace.name || '新地点'
    );

    travelInfo.availableTime = availableMinutes;

    // 所需总时间 = 交通时间 + 缓冲时间
    const requiredMinutes = travelInfo.estimatedDuration + this.MIN_BUFFER_MINUTES;

    // 如果可用时间不足
    if (availableMinutes < requiredMinutes) {
      const shortfall = requiredMinutes - availableMinutes;
      const suggestedStart = prevEnd.plus({ minutes: requiredMinutes });
      const duration = DateTime.fromJSDate(newItem.endTime).diff(newStart, 'minutes').minutes;
      const suggestedEnd = suggestedStart.plus({ minutes: duration });

      return this.fail(
        `交通时间不足：从「${travelInfo.fromPlace}」到「${travelInfo.toPlace}」需要约 ${travelInfo.estimatedDuration} 分钟，但仅预留了 ${availableMinutes} 分钟（差 ${Math.ceil(shortfall)} 分钟）`,
        {
          fromPlace: {
            name: travelInfo.fromPlace,
            coordinates: [fromCoords.lat, fromCoords.lng],
          },
          toPlace: {
            name: travelInfo.toPlace,
            coordinates: [toCoords.lat, toCoords.lng],
          },
          distance: {
            straight: travelInfo.straightDistance,
            road: travelInfo.roadDistance,
            unit: 'km',
          },
          travelTime: {
            estimated: travelInfo.estimatedDuration,
            withBuffer: requiredMinutes,
            unit: 'minutes',
          },
          recommendedTransport: travelInfo.recommendedTransport,
          availableTime: availableMinutes,
          shortfall: Math.ceil(shortfall),
          suggestedStartTime: suggestedStart.toISO(),
        },
        [
          {
            action: 'ADJUST_TIME',
            description: `将开始时间调整为 ${suggestedStart.toFormat('HH:mm')}`,
            suggestedValue: {
              startTime: suggestedStart.toISO() || undefined,
              endTime: suggestedEnd.toISO() || undefined,
            },
            estimatedImprovement: `确保有 ${requiredMinutes} 分钟的交通和缓冲时间`,
          },
          {
            action: 'CHANGE_TRANSPORT',
            description: this.getTransportSuggestion(travelInfo.recommendedTransport),
            suggestedValue: {
              transportMode: travelInfo.recommendedTransport,
            },
          },
        ]
      );
    }

    return this.pass();
  }

  /**
   * 获取交通建议文案
   */
  private getTransportSuggestion(mode: string): string {
    switch (mode) {
      case 'WALKING':
        return '当前距离适合步行';
      case 'DRIVING':
        return '建议打车或自驾以节省时间';
      case 'TRANSIT':
        return '建议使用公共交通';
      default:
        return '请根据实际情况选择交通方式';
    }
  }

  /**
   * 计算交通时间
   */
  private async calculateTravelTime(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    fromName: string,
    toName: string
  ): Promise<TravelInfo> {
    // 计算直线距离
    const straightDistance = this.calculateHaversineDistance(fromLat, fromLng, toLat, toLng);

    // 根据距离选择交通方式
    const recommendedTransport: 'WALKING' | 'DRIVING' | 'TRANSIT' = 
      straightDistance < 2 ? 'WALKING' :
      straightDistance < 50 ? 'DRIVING' :
      'TRANSIT';

    // 尝试从缓存获取
    const cacheKey = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}-${toLat.toFixed(4)},${toLng.toFixed(4)}-${recommendedTransport}`;
    const cached = this.cacheService?.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        fromPlace: fromName,
        toPlace: toName,
        availableTime: 0,
      };
    }

    // 尝试使用 SmartRoutesService 获取精确时间
    let estimatedDuration: number;
    let roadDistance: number | undefined;

    if (this.smartRoutesService) {
      try {
        const routes = await this.smartRoutesService.getRoutes(
          fromLat,
          fromLng,
          toLat,
          toLng,
          recommendedTransport
        );

        if (routes.length > 0) {
          estimatedDuration = routes[0].durationMinutes;
          roadDistance = Math.round(straightDistance * 1.3 * 10) / 10; // 道路通常比直线长 30%
          
          // 缓存结果
          this.cacheService?.set(cacheKey, {
            straightDistance,
            roadDistance,
            estimatedDuration,
            recommendedTransport,
          });

          return {
            fromPlace: fromName,
            toPlace: toName,
            straightDistance,
            roadDistance,
            estimatedDuration,
            recommendedTransport,
            availableTime: 0,
          };
        }
      } catch (error) {
        this.logger.warn(`SmartRoutesService 调用失败，使用估算值: ${error}`);
      }
    }

    // 降级：使用估算值
    estimatedDuration = this.estimateTravelTime(straightDistance, recommendedTransport);

    return {
      fromPlace: fromName,
      toPlace: toName,
      straightDistance,
      estimatedDuration,
      recommendedTransport,
      availableTime: 0,
    };
  }

  /**
   * Haversine 公式计算直线距离（公里）
   */
  private calculateHaversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10; // 保留一位小数
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 估算交通时间（降级方案）
   */
  private estimateTravelTime(distanceKm: number, mode: 'WALKING' | 'DRIVING' | 'TRANSIT'): number {
    switch (mode) {
      case 'WALKING':
        return Math.ceil(distanceKm / 5 * 60); // 5km/h
      case 'DRIVING':
        return Math.ceil(distanceKm / 40 * 60); // 40km/h（考虑城市交通）
      case 'TRANSIT':
        return Math.ceil(distanceKm / 30 * 60) + 15; // 30km/h + 15分钟等候
      default:
        return Math.ceil(distanceKm / 30 * 60);
    }
  }
}
