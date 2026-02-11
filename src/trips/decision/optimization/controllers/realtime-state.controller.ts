// src/trips/decision/optimization/controllers/realtime-state.controller.ts
/**
 * 实时状态更新 API Controller
 * 
 * 提供：
 * - 状态订阅管理
 * - 观测数据提交
 * - 状态查询和预测
 */

import { Controller, Post, Get, Delete, Body, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

import { RealtimeWorldStateService } from '../realtime/realtime-world-state.service';
import {
  SubscriptionConfig,
  WorldObservation,
  StateChangeEvent,
  BayesianUpdateConfig,
} from '../realtime/realtime-world-state.interface';
import { ProbabilisticWorldModelContext } from '../probabilistic/probabilistic-world-model.interface';

// ========== DTOs ==========

class SubscribeDto {
  tripId!: string;
  userId!: string;
  eventTypes!: StateChangeEvent['changeType'][];
  minSeverity!: 'INFO' | 'WARNING' | 'CRITICAL';
  updateIntervalSeconds!: number;
  includePredictions?: boolean;
}

class SubmitObservationDto {
  type!: 'WEATHER' | 'ROAD_STATUS' | 'HAZARD' | 'HUMAN_STATE' | 'TRANSPORT';
  source!: 'USER_REPORT' | 'WEATHER_API' | 'ROAD_AUTHORITY' | 'SENSOR' | 'PREDICTION' | 'CROWD_SOURCE';
  location?: {
    lat: number;
    lng: number;
    segmentId?: string;
  };
  data!: Record<string, any>;
  confidence!: number;
  validityHours!: number;
}

class InitializeStateDto {
  tripId!: string;
  initialState!: ProbabilisticWorldModelContext;
}

class BayesianUpdateDto {
  observations!: WorldObservation[];
  config?: BayesianUpdateConfig;
}

@ApiTags('Realtime State')
@Controller('v2/realtime')
export class RealtimeStateController {
  private readonly logger = new Logger(RealtimeStateController.name);

  constructor(
    private readonly realtimeService: RealtimeWorldStateService,
  ) {}

  // ========== 订阅管理 ==========

  @Post('subscribe')
  @ApiOperation({ summary: '订阅状态更新' })
  @ApiResponse({ status: 200, description: '返回订阅 ID' })
  async subscribe(@Body() dto: SubscribeDto): Promise<{ subscriptionId: string }> {
    this.logger.log(`[Realtime] 创建订阅: trip=${dto.tripId}, user=${dto.userId}`);
    
    const subscriptionId = await this.realtimeService.subscribe({
      tripId: dto.tripId,
      userId: dto.userId,
      eventTypes: dto.eventTypes,
      minSeverity: dto.minSeverity,
      updateIntervalSeconds: dto.updateIntervalSeconds,
      includePredictions: dto.includePredictions || false,
    });
    
    return { subscriptionId };
  }

  @Delete('subscribe/:subscriptionId')
  @ApiOperation({ summary: '取消订阅' })
  @ApiParam({ name: 'subscriptionId', description: '订阅 ID' })
  async unsubscribe(@Param('subscriptionId') subscriptionId: string): Promise<{ success: boolean }> {
    this.logger.log(`[Realtime] 取消订阅: ${subscriptionId}`);
    await this.realtimeService.unsubscribe(subscriptionId);
    return { success: true };
  }

  // ========== 状态管理 ==========

  @Post('state/initialize')
  @ApiOperation({ summary: '初始化行程状态' })
  async initializeState(@Body() dto: InitializeStateDto): Promise<{ success: boolean }> {
    this.logger.log(`[Realtime] 初始化状态: ${dto.tripId}`);
    this.realtimeService.initializeState(dto.tripId, dto.initialState);
    return { success: true };
  }

  @Get('state/:tripId')
  @ApiOperation({ summary: '获取当前状态' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getCurrentState(@Param('tripId') tripId: string): Promise<ProbabilisticWorldModelContext> {
    return this.realtimeService.getCurrentState(tripId);
  }

  @Get('state/:tripId/predict')
  @ApiOperation({ summary: '预测未来状态' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({ name: 'hoursAhead', description: '预测未来小时数', required: true })
  async predictFutureState(
    @Param('tripId') tripId: string,
    @Query('hoursAhead') hoursAhead: number,
  ): Promise<ProbabilisticWorldModelContext> {
    const currentState = await this.realtimeService.getCurrentState(tripId);
    return this.realtimeService.predictFutureState(currentState, hoursAhead);
  }

  // ========== 观测数据 ==========

  @Post('observation')
  @ApiOperation({ summary: '提交观测数据' })
  @ApiResponse({ status: 200, description: '观测已记录' })
  async submitObservation(@Body() dto: SubmitObservationDto): Promise<{ observationId: string }> {
    this.logger.log(`[Realtime] 收到观测: ${dto.type} from ${dto.source}`);
    
    const observation: WorldObservation = {
      observationId: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: dto.type,
      source: dto.source,
      timestamp: new Date().toISOString(),
      location: dto.location,
      data: dto.data,
      confidence: dto.confidence,
      validityHours: dto.validityHours,
    };
    
    await this.realtimeService.submitObservation(observation);
    
    return { observationId: observation.observationId };
  }

  @Post('observation/batch')
  @ApiOperation({ summary: '批量提交观测数据' })
  async submitObservationBatch(@Body() dtos: SubmitObservationDto[]): Promise<{ count: number; observationIds: string[] }> {
    this.logger.log(`[Realtime] 批量观测: ${dtos.length} 条`);
    
    const observationIds: string[] = [];
    
    for (const dto of dtos) {
      const observation: WorldObservation = {
        observationId: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: dto.type,
        source: dto.source,
        timestamp: new Date().toISOString(),
        location: dto.location,
        data: dto.data,
        confidence: dto.confidence,
        validityHours: dto.validityHours,
      };
      
      await this.realtimeService.submitObservation(observation);
      observationIds.push(observation.observationId);
    }
    
    return { count: observationIds.length, observationIds };
  }

  // ========== 贝叶斯更新 ==========

  @Post('state/:tripId/bayesian-update')
  @ApiOperation({ summary: '执行贝叶斯更新' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async bayesianUpdate(
    @Param('tripId') tripId: string,
    @Body() dto: BayesianUpdateDto,
  ): Promise<ProbabilisticWorldModelContext> {
    this.logger.log(`[Realtime] 贝叶斯更新: ${tripId}, ${dto.observations.length} 观测`);
    
    const currentState = await this.realtimeService.getCurrentState(tripId);
    const updatedState = this.realtimeService.bayesianUpdate(
      currentState,
      dto.observations,
      dto.config,
    );
    
    // 更新缓存
    this.realtimeService.initializeState(tripId, updatedState);
    
    return updatedState;
  }

  // ========== 变化检测 ==========

  @Post('state/:tripId/detect-changes')
  @ApiOperation({ summary: '检测状态变化' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async detectChanges(
    @Param('tripId') tripId: string,
    @Body() previousState: ProbabilisticWorldModelContext,
  ): Promise<StateChangeEvent[]> {
    const currentState = await this.realtimeService.getCurrentState(tripId);
    return this.realtimeService.detectChanges(previousState, currentState);
  }
}
