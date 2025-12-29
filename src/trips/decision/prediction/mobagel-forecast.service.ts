// src/trips/decision/prediction/mobagel-forecast.service.ts
/**
 * MoBagel 预测服务实现
 * 
 * 注意：这是一个占位实现，实际需要：
 * 1. 接入 MoBagel API 或自建预测模型
 * 2. 有足够的历史数据
 * 3. 在 Priority 3 阶段实施
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  IMoBagelForecastService,
  PriceForecast,
  CrowdForecast,
  RouteRiskForecast,
  RouteAbandonmentForecast,
  FatigueFailureForecast,
} from './mobagel-forecast.interface';

@Injectable()
export class MoBagelForecastService implements IMoBagelForecastService {
  private readonly logger = new Logger(MoBagelForecastService.name);

  /**
   * 获取价格预测
   * 
   * TODO: 接入 MoBagel API 或自建模型
   */
  async getPriceForecast(
    countryCode: string,
    month: number,
    routeDirectionId?: string
  ): Promise<PriceForecast> {
    this.logger.warn('MoBagelForecastService.getPriceForecast 尚未实现，返回占位数据');

    // 占位实现
    return {
      countryCode,
      month,
      routeDirectionId,
      budgetRange: {
        min: 1000,
        max: 5000,
        median: 2500,
        percentile25: 1500,
        percentile75: 3500,
      },
      costBreakdown: {
        flight: { min: 500, max: 2000, median: 1000 },
        hotel: { min: 50, max: 200, median: 100 },
        carRental: { min: 30, max: 150, median: 70 },
      },
      confidence: 0.5, // 低置信度，因为只是占位数据
      dataSource: 'MODEL_PREDICTION',
      metadata: {
        note: '这是占位实现，需要接入真实预测模型',
      },
    };
  }

  /**
   * 获取拥挤度预测
   * 
   * TODO: 接入 MoBagel API 或自建模型
   */
  async getCrowdForecast(
    countryCode: string,
    month: number,
    regionId?: string,
    poiId?: string
  ): Promise<CrowdForecast> {
    this.logger.warn('MoBagelForecastService.getCrowdForecast 尚未实现，返回占位数据');

    // 占位实现
    return {
      countryCode,
      month,
      regionId,
      poiId,
      crowdLevel: 'MEDIUM',
      crowdScore: 0.5,
      confidence: 0.5,
      metadata: {
        note: '这是占位实现，需要接入真实预测模型',
      },
    };
  }

  /**
   * 获取路线风险预测
   * 
   * TODO: 接入 MoBagel API 或自建模型
   */
  async getRouteRiskForecast(
    countryCode: string,
    month: number,
    routeDirectionId: string,
    segmentId?: string
  ): Promise<RouteRiskForecast> {
    this.logger.warn('MoBagelForecastService.getRouteRiskForecast 尚未实现，返回占位数据');

    // 占位实现
    return {
      countryCode,
      month,
      routeDirectionId,
      segmentId,
      closureProbability: 0.2,
      weatherRiskLevel: 'MEDIUM',
      weatherRiskScore: 0.4,
      riskItems: [],
      confidence: 0.5,
      metadata: {
        note: '这是占位实现，需要接入真实预测模型',
      },
    };
  }

  /**
   * 获取路线放弃率预测
   * 
   * TODO: 接入 MoBagel API 或自建模型
   */
  async getRouteAbandonmentForecast(
    routeDirectionId: string,
    userProfile: RouteAbandonmentForecast['userProfile']
  ): Promise<RouteAbandonmentForecast> {
    this.logger.warn('MoBagelForecastService.getRouteAbandonmentForecast 尚未实现，返回占位数据');

    // 占位实现
    return {
      routeDirectionId,
      userProfile,
      abandonmentProbability: 0.1,
      predictedReasons: [],
      confidence: 0.5,
      metadata: {
        note: '这是占位实现，需要接入真实预测模型',
      },
    };
  }

  /**
   * 获取疲劳失败率预测
   * 
   * TODO: 接入 MoBagel API 或自建模型
   */
  async getFatigueFailureForecast(
    routeDirectionId: string,
    humanCapability: FatigueFailureForecast['humanCapability']
  ): Promise<FatigueFailureForecast> {
    this.logger.warn('MoBagelForecastService.getFatigueFailureForecast 尚未实现，返回占位数据');

    // 占位实现
    return {
      routeDirectionId,
      humanCapability,
      failureProbability: 0.15,
      confidence: 0.5,
      metadata: {
        note: '这是占位实现，需要接入真实预测模型',
      },
    };
  }
}

