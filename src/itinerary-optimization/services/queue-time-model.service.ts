// src/itinerary-optimization/services/queue-time-model.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  QueueTimeEstimate,
  QueueTimeModelConfig,
  POIType,
  TimePeriod,
} from '../interfaces/executability-enhancement.interface';
import { DateTime } from 'luxon';

/**
 * 排队时间模型服务
 * 
 * 根据POI类型、时间段、季节等因素估算排队时间
 */
@Injectable()
export class QueueTimeModelService {
  private readonly logger = new Logger(QueueTimeModelService.name);

  // 默认配置
  private readonly defaultConfig: Required<Omit<QueueTimeModelConfig, 'poiId' | 'poiType' | 'baseWaitTime'>> = {
    peakMultiplier: 1.5,
    seasonMultiplier: 1.2,
    dayOfWeekMultiplier: {
      0: 1.3, // 周日
      1: 1.0, // 周一
      2: 1.0, // 周二
      3: 1.0, // 周三
      4: 1.0, // 周四
      5: 1.1, // 周五
      6: 1.4, // 周六
    },
    timeOfDayMultiplier: {
      '09:00-11:00': 1.2,
      '11:00-13:00': 1.5, // 午餐时间
      '13:00-15:00': 1.1,
      '15:00-17:00': 1.3,
      '17:00-19:00': 1.4, // 晚餐时间
      '19:00-21:00': 1.2,
    },
    popularityScore: 0.5,
  };

  /**
   * 估算排队时间
   */
  async estimateQueueTime(
    poiId: string,
    poiName: string,
    poiType: POIType,
    visitDateTime: DateTime,
    config?: Partial<QueueTimeModelConfig>
  ): Promise<QueueTimeEstimate> {
    // 合并配置
    const fullConfig: QueueTimeModelConfig = {
      poiId,
      poiType,
      baseWaitTime: this.getBaseWaitTime(poiType),
      ...this.defaultConfig,
      ...config,
    };

    // 确定时间段
    const timePeriod = this.determineTimePeriod(visitDateTime);
    const isPeakHour = timePeriod === 'PEAK';
    const isPeakSeason = this.isPeakSeason(visitDateTime);
    const isWeekend = visitDateTime.weekday === 6 || visitDateTime.weekday === 7;
    const isHoliday = await this.isHoliday(visitDateTime);

    // 计算倍数
    const peakMultiplier = isPeakHour ? fullConfig.peakMultiplier! : 1.0;
    const seasonMultiplier = isPeakSeason ? fullConfig.seasonMultiplier! : 1.0;
    const dayOfWeekMultiplier = fullConfig.dayOfWeekMultiplier![visitDateTime.weekday % 7] || 1.0;
    const timeOfDayMultiplier = this.getTimeOfDayMultiplier(visitDateTime, fullConfig.timeOfDayMultiplier!);
    const holidayMultiplier = isHoliday ? 1.3 : 1.0;
    const popularityMultiplier = 1.0 + (fullConfig.popularityScore || 0.5) * 0.5; // 0.5-1.5倍

    // 计算估算等待时间
    const estimatedWaitTime = Math.round(
      fullConfig.baseWaitTime *
      peakMultiplier *
      seasonMultiplier *
      dayOfWeekMultiplier *
      timeOfDayMultiplier *
      holidayMultiplier *
      popularityMultiplier
    );

    // 计算置信度（基于数据完整性）
    const confidence = this.calculateConfidence(fullConfig, visitDateTime);

    // 生成建议
    const recommendations = this.generateRecommendations(
      isPeakHour,
      isPeakSeason,
      isWeekend,
      isHoliday,
      estimatedWaitTime
    );

    return {
      poiId,
      poiName,
      poiType,
      baseWaitTime: fullConfig.baseWaitTime,
      estimatedWaitTime,
      peakMultiplier,
      seasonMultiplier,
      dayOfWeekMultiplier,
      timeOfDayMultiplier,
      confidence,
      factors: {
        isPeakHour,
        isPeakSeason,
        isWeekend,
        isHoliday,
      },
      recommendations,
    };
  }

  /**
   * 根据POI类型获取基础等待时间
   */
  private getBaseWaitTime(poiType: POIType): number {
    const baseWaitTimes: Record<POIType, number> = {
      ATTRACTION: 30,      // 景点：30分钟
      RESTAURANT: 20,      // 餐厅：20分钟
      MUSEUM: 15,          // 博物馆：15分钟
      THEME_PARK: 60,      // 主题公园：60分钟
      SHOPPING: 10,        // 购物：10分钟
      ENTERTAINMENT: 25,   // 娱乐：25分钟
      OTHER: 15,           // 其他：15分钟
    };

    return baseWaitTimes[poiType] || 15;
  }

  /**
   * 确定时间段类型
   */
  private determineTimePeriod(dateTime: DateTime): TimePeriod {
    const hour = dateTime.hour;
    
    // 高峰期：11:00-13:00, 17:00-19:00
    if ((hour >= 11 && hour < 13) || (hour >= 17 && hour < 19)) {
      return 'PEAK';
    }
    
    // 过渡期：09:00-11:00, 13:00-15:00, 19:00-21:00
    if ((hour >= 9 && hour < 11) || (hour >= 13 && hour < 15) || (hour >= 19 && hour < 21)) {
      return 'SHOULDER';
    }
    
    // 非高峰期：其他时间
    return 'OFF_PEAK';
  }

  /**
   * 判断是否是旺季
   */
  private isPeakSeason(dateTime: DateTime): boolean {
    const month = dateTime.month;
    
    // 旺季：4-5月（春季）、7-8月（夏季）、10月（秋季）
    return month >= 4 && month <= 5 || month >= 7 && month <= 8 || month === 10;
  }

  /**
   * 判断是否是节假日
   */
  private async isHoliday(dateTime: DateTime): Promise<boolean> {
    // 简化实现：检查是否是周末
    // 实际实现应该查询节假日数据库或API
    return dateTime.weekday === 6 || dateTime.weekday === 7;
  }

  /**
   * 获取时段倍数
   */
  private getTimeOfDayMultiplier(
    dateTime: DateTime,
    timeOfDayMultiplier: Record<string, number>
  ): number {
    const hour = dateTime.hour;
    const minute = dateTime.minute;
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    // 查找匹配的时段
    for (const [range, multiplier] of Object.entries(timeOfDayMultiplier)) {
      const [start, end] = range.split('-');
      const [startHour, startMin] = start.split(':').map(Number);
      const [endHour, endMin] = end.split(':').map(Number);
      
      const currentMinutes = hour * 60 + minute;
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return multiplier;
      }
    }

    return 1.0;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    config: QueueTimeModelConfig,
    dateTime: DateTime
  ): number {
    let confidence = 0.7; // 基础置信度

    // 如果有自定义配置，置信度提高
    if (config.popularityScore !== undefined) {
      confidence += 0.1;
    }

    // 如果有历史数据，置信度提高
    // 这里简化处理，实际应该查询历史数据
    confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    isPeakHour: boolean,
    isPeakSeason: boolean,
    isWeekend: boolean,
    isHoliday: boolean,
    estimatedWaitTime: number
  ): string[] {
    const recommendations: string[] = [];

    if (isPeakHour) {
      recommendations.push('当前为高峰期，建议避开11:00-13:00或17:00-19:00');
    }

    if (isPeakSeason) {
      recommendations.push('当前为旅游旺季，排队时间可能较长');
    }

    if (isWeekend || isHoliday) {
      recommendations.push('周末或节假日排队时间通常更长，建议工作日前往');
    }

    if (estimatedWaitTime > 60) {
      recommendations.push(`预计排队时间较长（${estimatedWaitTime}分钟），建议提前预约或选择其他时间段`);
    } else if (estimatedWaitTime > 30) {
      recommendations.push(`预计排队时间中等（${estimatedWaitTime}分钟），建议预留充足时间`);
    }

    return recommendations;
  }
}
