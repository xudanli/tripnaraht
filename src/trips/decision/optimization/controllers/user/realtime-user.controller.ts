// src/trips/decision/optimization/controllers/user/realtime-user.controller.ts
/**
 * 用户端 - 实时状态 API
 * 
 * 提供行程状态订阅、查询和用户报告功能
 */

import { Controller, Post, Get, Delete, Body, Param, Query, Logger, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';

import { RealtimeWorldStateService } from '../../realtime/realtime-world-state.service';
import {
  SubscriptionConfig,
  WorldObservation,
  StateChangeEvent,
} from '../../realtime/realtime-world-state.interface';
import { ProbabilisticWorldModelContext } from '../../probabilistic/probabilistic-world-model.interface';

// ========== Request DTOs ==========

export class SubscribeDto {
  /** 行程 ID */
  tripId!: string;
  /** 用户 ID */
  userId!: string;
  /** 订阅的事件类型 */
  eventTypes!: StateChangeEvent['changeType'][];
  /** 最低严重程度 */
  minSeverity!: 'INFO' | 'WARNING' | 'CRITICAL';
  /** 更新间隔（秒） */
  updateIntervalSeconds!: number;
  /** 是否包含预测 */
  includePredictions?: boolean;
}

export class UserReportDto {
  /** 报告类型 */
  type!: 'WEATHER' | 'ROAD_STATUS' | 'HAZARD' | 'HUMAN_STATE';
  /** 位置信息 */
  location?: {
    /** 纬度 */
    lat: number;
    /** 经度 */
    lng: number;
    /** 路段 ID */
    segmentId?: string;
  };
  /** 报告数据 */
  data!: Record<string, any>;
  /** 置信度 (0-1) */
  confidence!: number;
}

// ========== Response Types ==========

export interface SubscriptionResponse {
  /** 订阅 ID */
  subscriptionId: string;
  /** 下次更新时间 */
  nextUpdateAt: string;
}

export interface CurrentStateResponse {
  /** 行程 ID */
  tripId: string;
  /** 更新时间 */
  updatedAt: string;
  /** 天气状态 */
  weather: {
    /** 当前温度 (预期值) */
    temperatureC: number;
    /** 风速 (预期值) */
    windSpeedMs: number;
    /** 降水概率 */
    precipitationProbability: number;
    /** 能见度等级 */
    visibility: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' | 'VERY_POOR';
    /** 预警 */
    alerts: string[];
  };
  /** 道路状态 */
  roads: Array<{
    /** 路段 ID */
    segmentId: string;
    /** 状态 */
    status: 'OPEN' | 'RESTRICTED' | 'CLOSED';
    /** 通行概率 */
    accessProbability: number;
    /** 预警信息 */
    warning?: string;
  }>;
  /** 人体状态 */
  human: {
    /** 疲劳等级 */
    fatigueLevel: number;
    /** 高反风险 */
    altitudeSicknessRisk: number;
    /** 建议 */
    recommendations: string[];
  };
}

export interface PredictionResponse {
  /** 预测时间点 */
  predictedAt: string;
  /** 预测范围（小时） */
  hoursAhead: number;
  /** 天气预测 */
  weather: {
    temperatureC: { mean: number; stdDev: number };
    windSpeedMs: { mean: number; stdDev: number };
    precipitationProbability: number;
  };
  /** 可行性预测 */
  feasibility: {
    /** 可行概率 */
    probability: number;
    /** 主要风险因素 */
    riskFactors: string[];
  };
  /** 置信度 */
  confidence: number;
}

@ApiTags('User - Realtime')
@ApiBearerAuth()
@Controller('v2/user/realtime')
export class RealtimeUserController {
  private readonly logger = new Logger(RealtimeUserController.name);

  constructor(
    private readonly realtimeService: RealtimeWorldStateService,
  ) {}

  // ========== 订阅管理 ==========

  @Post('subscribe')
  @ApiOperation({ 
    summary: '订阅状态更新',
    description: '订阅行程的实时状态变化推送'
  })
  @ApiResponse({ status: 200, description: '返回订阅信息' })
  async subscribe(@Body() dto: SubscribeDto): Promise<SubscriptionResponse> {
    this.logger.log(`[User] 订阅: trip=${dto.tripId}, user=${dto.userId}`);
    
    const subscriptionId = await this.realtimeService.subscribe({
      tripId: dto.tripId,
      userId: dto.userId,
      eventTypes: dto.eventTypes,
      minSeverity: dto.minSeverity,
      updateIntervalSeconds: dto.updateIntervalSeconds,
      includePredictions: dto.includePredictions || false,
    });
    
    const nextUpdateAt = new Date(Date.now() + dto.updateIntervalSeconds * 1000).toISOString();
    
    return { subscriptionId, nextUpdateAt };
  }

  @Delete('subscribe/:subscriptionId')
  @ApiOperation({ 
    summary: '取消订阅',
    description: '取消状态更新订阅'
  })
  @ApiParam({ name: 'subscriptionId', description: '订阅 ID' })
  @ApiResponse({ status: 200, description: '取消成功' })
  async unsubscribe(@Param('subscriptionId') subscriptionId: string): Promise<{ success: boolean }> {
    this.logger.log(`[User] 取消订阅: ${subscriptionId}`);
    await this.realtimeService.unsubscribe(subscriptionId);
    return { success: true };
  }

  // ========== 状态查询 ==========

  @Get('state/:tripId')
  @ApiOperation({ 
    summary: '获取当前状态',
    description: '返回行程的当前实时状态（天气、道路、人体）'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, description: '返回当前状态' })
  @ApiResponse({ status: 404, description: '行程状态未初始化' })
  async getCurrentState(@Param('tripId') tripId: string): Promise<CurrentStateResponse> {
    const state = await this.realtimeService.getCurrentState(tripId);
    
    // 如果状态不存在，返回 404
    if (!state) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        message: `行程 ${tripId} 的实时状态未初始化`,
        hint: '请先调用 POST /api/v2/admin/realtime/initialize/:tripId 初始化状态，或该行程不支持实时状态功能',
      });
    }
    
    const weather = state.physical?.weather;
    const roads = state.physical?.roadStatuses || [];
    const human = state.human;
    
    // 转换为用户友好格式
    return {
      tripId,
      updatedAt: new Date().toISOString(),
      weather: {
        temperatureC: weather?.temperature?.params?.mean || 15,
        windSpeedMs: weather?.windSpeed?.params?.mean || 5,
        precipitationProbability: weather?.precipitation?.params?.mean || 0.1,
        visibility: this.mapVisibility(weather?.visibility),
        alerts: this.extractWeatherAlerts(state),
      },
      roads: roads.map(road => ({
        segmentId: road.roadId,
        status: this.mapRoadStatus(road),
        accessProbability: this.getBetaMean(road.conditionQuality) || 1,
        warning: (this.getBetaMean(road.conditionQuality) || 1) < 0.7 ? '通行可能受限' : undefined,
      })),
      human: {
        fatigueLevel: human?.fatigueThreshold?.params?.mean 
          ? (1 - human.fatigueThreshold.params.mean / 2) : 0.3,
        altitudeSicknessRisk: human?.altitudeAdaptation 
          ? (1 - this.getBetaMean(human.altitudeAdaptation)) : 0,
        recommendations: this.generateHumanRecommendations(state),
      },
    };
  }

  @Get('state/:tripId/predict')
  @ApiOperation({ 
    summary: '预测未来状态',
    description: '预测指定小时后的状态'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({ name: 'hoursAhead', description: '预测未来小时数', required: true, type: Number })
  @ApiResponse({ status: 200, description: '返回预测结果' })
  @ApiResponse({ status: 404, description: '行程状态未初始化' })
  async predictFutureState(
    @Param('tripId') tripId: string,
    @Query('hoursAhead') hoursAhead: number,
  ): Promise<PredictionResponse> {
    const currentState = await this.realtimeService.getCurrentState(tripId);
    
    // 如果状态不存在，返回 404
    if (!currentState) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        message: `行程 ${tripId} 的实时状态未初始化，无法预测`,
        hint: '请先调用 POST /api/v2/admin/realtime/initialize/:tripId 初始化状态',
      });
    }
    
    const predictedState = await this.realtimeService.predictFutureState(currentState, hoursAhead);
    const weather = predictedState.physical?.weather;
    const human = predictedState.human;
    
    const riskFactors: string[] = [];
    if ((weather?.precipitation?.params?.mean || 0) > 0.5) {
      riskFactors.push('高降水概率');
    }
    if ((weather?.windSpeed?.params?.mean || 0) > 15) {
      riskFactors.push('强风预警');
    }
    if ((human?.currentCumulativeFatigue || 0) > 0.7) {
      riskFactors.push('疲劳累积');
    }
    
    return {
      predictedAt: new Date(Date.now() + hoursAhead * 3600000).toISOString(),
      hoursAhead,
      weather: {
        temperatureC: {
          mean: weather?.temperature?.params?.mean || 15,
          stdDev: Math.sqrt(weather?.temperature?.params?.variance || 4),
        },
        windSpeedMs: {
          mean: weather?.windSpeed?.params?.mean || 5,
          stdDev: Math.sqrt(weather?.windSpeed?.params?.variance || 9),
        },
        precipitationProbability: weather?.precipitation?.params?.mean || 0.1,
      },
      feasibility: {
        probability: this.calculateFeasibility(predictedState),
        riskFactors,
      },
      confidence: Math.max(0.5, 1 - hoursAhead * 0.02), // 随时间降低
    };
  }

  // ========== 用户报告 ==========

  @Post('report')
  @ApiOperation({ 
    summary: '提交实地报告',
    description: '用户提交实地观察到的天气、道路或危险情况'
  })
  @ApiResponse({ status: 200, description: '报告已记录' })
  async submitReport(@Body() dto: UserReportDto): Promise<{ reportId: string; thanksMessage: string }> {
    this.logger.log(`[User] 提交报告: ${dto.type}`);
    
    const observation: WorldObservation = {
      observationId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: dto.type,
      source: 'USER_REPORT',
      timestamp: new Date().toISOString(),
      location: dto.location,
      data: dto.data,
      confidence: dto.confidence * 0.8, // 用户报告信心略降
      validityHours: 2, // 用户报告有效期较短
    };
    
    await this.realtimeService.submitObservation(observation);
    
    return {
      reportId: observation.observationId,
      thanksMessage: '感谢您的报告！这将帮助其他旅行者。',
    };
  }

  // ========== 辅助方法 ==========

  private mapVisibility(visibility: any): CurrentStateResponse['weather']['visibility'] {
    if (!visibility) return 'GOOD';
    const prob = visibility.categories?.['EXCELLENT'] || 0;
    if (prob > 0.7) return 'EXCELLENT';
    if (prob > 0.5) return 'GOOD';
    if (prob > 0.3) return 'MODERATE';
    if (prob > 0.1) return 'POOR';
    return 'VERY_POOR';
  }

  private mapRoadStatus(road: any): 'OPEN' | 'RESTRICTED' | 'CLOSED' {
    const prob = this.getBetaMean(road.conditionQuality) || 1;
    if (prob > 0.9) return 'OPEN';
    if (prob > 0.5) return 'RESTRICTED';
    return 'CLOSED';
  }

  private extractWeatherAlerts(state: ProbabilisticWorldModelContext): string[] {
    const alerts: string[] = [];
    const weather = state.physical?.weather;
    if ((weather?.windSpeed?.params?.mean || 0) > 15) {
      alerts.push('强风预警');
    }
    if ((weather?.precipitation?.params?.mean || 0) > 0.6) {
      alerts.push('降水预警');
    }
    if ((weather?.temperature?.params?.mean || 15) < 0) {
      alerts.push('低温预警');
    }
    return alerts;
  }

  private generateHumanRecommendations(state: ProbabilisticWorldModelContext): string[] {
    const recs: string[] = [];
    const human = state.human;
    const fatigue = human?.currentCumulativeFatigue || 0.3;
    
    if (fatigue > 0.7) {
      recs.push('建议增加休息时间');
    }
    if (fatigue > 0.5) {
      recs.push('注意补充水分和能量');
    }
    if (human?.altitudeAdaptation && this.getBetaMean(human.altitudeAdaptation) < 0.7) {
      recs.push('关注高反症状，必要时下降海拔');
    }
    
    if (recs.length === 0) {
      recs.push('状态良好，继续保持');
    }
    
    return recs;
  }

  private calculateFeasibility(state: ProbabilisticWorldModelContext): number {
    let feasibility = 1.0;
    const weather = state.physical?.weather;
    const human = state.human;
    
    // 天气影响
    const precip = weather?.precipitation?.params?.mean || 0;
    feasibility *= (1 - precip * 0.3);
    
    const wind = weather?.windSpeed?.params?.mean || 0;
    if (wind > 20) feasibility *= 0.5;
    else if (wind > 15) feasibility *= 0.8;
    
    // 人体影响
    const fatigue = human?.currentCumulativeFatigue || 0.3;
    if (fatigue > 0.8) feasibility *= 0.6;
    else if (fatigue > 0.6) feasibility *= 0.85;
    
    return Math.max(0, Math.min(1, feasibility));
  }

  /**
   * 计算 Beta 分布的均值: α / (α + β)
   */
  private getBetaMean(dist: { params?: { alpha?: number; beta?: number } } | undefined): number {
    if (!dist?.params?.alpha || !dist?.params?.beta) return 0.5;
    return dist.params.alpha / (dist.params.alpha + dist.params.beta);
  }
}
