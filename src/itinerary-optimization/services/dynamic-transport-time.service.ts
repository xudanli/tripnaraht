// src/itinerary-optimization/services/dynamic-transport-time.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  DynamicTransportTimeEstimate,
  DynamicTransportTimeConfig,
  TransportMode,
} from '../interfaces/executability-enhancement.interface';
import { DateTime } from 'luxon';

/**
 * 动态交通时间计算服务
 * 
 * 考虑拥堵、天气、高峰期等因素的动态交通时间计算
 */
@Injectable()
export class DynamicTransportTimeService {
  private readonly logger = new Logger(DynamicTransportTimeService.name);

  // 默认配置
  private readonly defaultConfig: Required<Omit<DynamicTransportTimeConfig, 'baseTime' | 'mode'>> = {
    congestionFactor: 0.3,
    weatherFactor: 0.1,
    bufferPercentage: 20,
    rushHourMultiplier: 1.5,
  };

  /**
   * 估算动态交通时间
   */
  async estimateTransportTime(
    from: { lat: number; lng: number; name?: string },
    to: { lat: number; lng: number; name?: string },
    mode: TransportMode,
    baseTime: number,
    travelDateTime: DateTime,
    config?: Partial<DynamicTransportTimeConfig>
  ): Promise<DynamicTransportTimeEstimate> {
    // 合并配置
    const fullConfig: DynamicTransportTimeConfig = {
      baseTime,
      mode,
      ...this.defaultConfig,
      ...config,
    };

    // 判断是否是高峰期
    const isRushHour = this.isRushHour(travelDateTime, mode);
    
    // 获取天气条件（简化实现，实际应该查询天气API）
    const weatherCondition = await this.getWeatherCondition(from, travelDateTime);
    
    // 获取路况（简化实现，实际应该查询交通API）
    const roadCondition = await this.getRoadCondition(from, to, travelDateTime, mode);
    
    // 判断是否是节假日
    const isHoliday = await this.isHoliday(travelDateTime);

    // 计算拥堵系数
    const congestionFactor = this.calculateCongestionFactor(
      isRushHour,
      roadCondition,
      mode,
      fullConfig.congestionFactor!
    );

    // 计算天气系数
    const weatherFactor = this.calculateWeatherFactor(
      weatherCondition,
      mode,
      fullConfig.weatherFactor!
    );

    // 计算时间倍数
    const rushHourMultiplier = isRushHour ? fullConfig.rushHourMultiplier! : 1.0;
    const holidayMultiplier = isHoliday ? 1.2 : 1.0;

    // 计算估算时间
    const estimatedTime = Math.round(
      baseTime *
      (1 + congestionFactor) *
      (1 + weatherFactor) *
      rushHourMultiplier *
      holidayMultiplier
    );

    // 计算缓冲时间
    const bufferTime = Math.round(estimatedTime * (fullConfig.bufferPercentage! / 100));

    // 计算置信度
    const confidence = this.calculateConfidence(fullConfig, weatherCondition, roadCondition);

    // 生成建议
    const recommendations = this.generateRecommendations(
      isRushHour,
      weatherCondition,
      roadCondition,
      estimatedTime,
      mode
    );

    return {
      from,
      to,
      mode,
      baseTime,
      estimatedTime,
      congestionFactor,
      weatherFactor,
      bufferTime,
      confidence,
      factors: {
        isRushHour,
        weatherCondition,
        roadCondition,
        isHoliday,
      },
      recommendations,
    };
  }

  /**
   * 判断是否是高峰期
   */
  private isRushHour(dateTime: DateTime, mode: TransportMode): boolean {
    const hour = dateTime.hour;
    
    // 地铁/公交高峰期：7:00-9:00, 17:00-19:00
    if (mode === 'SUBWAY' || mode === 'BUS') {
      return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
    }
    
    // 自驾高峰期：7:00-9:00, 17:00-19:00
    if (mode === 'DRIVE' || mode === 'TAXI') {
      return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
    }
    
    // 步行/自行车不受高峰期影响
    return false;
  }

  /**
   * 获取天气条件（简化实现）
   */
  private async getWeatherCondition(
    location: { lat: number; lng: number },
    dateTime: DateTime
  ): Promise<'CLEAR' | 'RAIN' | 'SNOW' | 'FOG' | 'STORM'> {
    // 简化实现：根据月份判断
    // 实际实现应该查询天气API
    const month = dateTime.month;
    
    if (month >= 6 && month <= 8) {
      // 夏季：可能有暴雨
      return Math.random() > 0.8 ? 'STORM' : 'CLEAR';
    } else if (month >= 12 || month <= 2) {
      // 冬季：可能有雪
      return Math.random() > 0.9 ? 'SNOW' : 'CLEAR';
    } else {
      // 其他季节：可能有雨
      return Math.random() > 0.7 ? 'RAIN' : 'CLEAR';
    }
  }

  /**
   * 获取路况（简化实现）
   */
  private async getRoadCondition(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    dateTime: DateTime,
    mode: TransportMode
  ): Promise<'NORMAL' | 'CONGESTED' | 'SEVERELY_CONGESTED'> {
    // 简化实现：根据高峰期和模式判断
    // 实际实现应该查询交通API
    const isRushHour = this.isRushHour(dateTime, mode);
    
    if (isRushHour) {
      return Math.random() > 0.5 ? 'SEVERELY_CONGESTED' : 'CONGESTED';
    }
    
    return 'NORMAL';
  }

  /**
   * 判断是否是节假日
   */
  private async isHoliday(dateTime: DateTime): Promise<boolean> {
    // 简化实现：检查是否是周末
    return dateTime.weekday === 6 || dateTime.weekday === 7;
  }

  /**
   * 计算拥堵系数
   */
  private calculateCongestionFactor(
    isRushHour: boolean,
    roadCondition: 'NORMAL' | 'CONGESTED' | 'SEVERELY_CONGESTED',
    mode: TransportMode,
    baseCongestionFactor: number
  ): number {
    let factor = baseCongestionFactor;

    if (isRushHour) {
      factor += 0.3;
    }

    if (roadCondition === 'CONGESTED') {
      factor += 0.2;
    } else if (roadCondition === 'SEVERELY_CONGESTED') {
      factor += 0.4;
    }

    // 不同交通模式的拥堵影响不同
    if (mode === 'DRIVE' || mode === 'TAXI') {
      factor *= 1.2; // 自驾受拥堵影响更大
    } else if (mode === 'SUBWAY' || mode === 'BUS') {
      factor *= 0.8; // 公共交通受拥堵影响较小
    }

    return Math.min(1.0, factor);
  }

  /**
   * 计算天气系数
   */
  private calculateWeatherFactor(
    weatherCondition: 'CLEAR' | 'RAIN' | 'SNOW' | 'FOG' | 'STORM',
    mode: TransportMode,
    baseWeatherFactor: number
  ): number {
    let factor = baseWeatherFactor;

    switch (weatherCondition) {
      case 'CLEAR':
        factor = 0;
        break;
      case 'RAIN':
        factor = 0.1;
        break;
      case 'FOG':
        factor = 0.2;
        break;
      case 'SNOW':
        factor = 0.3;
        break;
      case 'STORM':
        factor = 0.5;
        break;
    }

    // 不同交通模式受天气影响不同
    if (mode === 'WALK' || mode === 'BIKE') {
      factor *= 1.5; // 步行/自行车受天气影响更大
    } else if (mode === 'SUBWAY' || mode === 'BUS') {
      factor *= 0.5; // 公共交通受天气影响较小
    }

    return Math.min(1.0, factor);
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    config: DynamicTransportTimeConfig,
    weatherCondition: 'CLEAR' | 'RAIN' | 'SNOW' | 'FOG' | 'STORM',
    roadCondition: 'NORMAL' | 'CONGESTED' | 'SEVERELY_CONGESTED'
  ): number {
    let confidence = 0.7; // 基础置信度

    // 如果有实时数据，置信度提高
    if (roadCondition !== 'NORMAL') {
      confidence += 0.1; // 有路况数据
    }

    if (weatherCondition !== 'CLEAR') {
      confidence += 0.1; // 有天气数据
    }

    return Math.min(1.0, confidence);
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    isRushHour: boolean,
    weatherCondition: 'CLEAR' | 'RAIN' | 'SNOW' | 'FOG' | 'STORM',
    roadCondition: 'NORMAL' | 'CONGESTED' | 'SEVERELY_CONGESTED',
    estimatedTime: number,
    mode: TransportMode
  ): string[] {
    const recommendations: string[] = [];

    if (isRushHour) {
      recommendations.push('当前为高峰期，建议避开7:00-9:00或17:00-19:00');
    }

    if (weatherCondition === 'RAIN' || weatherCondition === 'SNOW' || weatherCondition === 'STORM') {
      recommendations.push(`天气条件不佳（${weatherCondition}），建议预留更多时间或选择公共交通`);
    }

    if (roadCondition === 'CONGESTED' || roadCondition === 'SEVERELY_CONGESTED') {
      recommendations.push(`路况拥堵（${roadCondition}），建议选择公共交通或预留更多时间`);
    }

    // 如果估算时间明显增加，给出建议
    if (estimatedTime > 60) {
      recommendations.push(`预计交通时间较长（${estimatedTime}分钟），建议提前出发或选择其他交通方式`);
    }

    return recommendations;
  }
}
