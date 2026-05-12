// src/trips/decision/optimization/controllers/admin/realtime-admin.controller.ts
/**
 * 管理端 - 实时状态管理 API
 * 
 * 提供批量数据导入、系统状态管理功能
 */

import { Controller, Post, Get, Body, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';

import { RealtimeWorldStateService } from '../../realtime/realtime-world-state.service';
import { WorldObservation } from '../../realtime/realtime-world-state.interface';
import { ProbabilisticWorldModelContext } from '../../probabilistic/probabilistic-world-model.interface';

// ========== Request DTOs ==========

export class BatchObservationDto {
  /** 数据来源 */
  source!: 'WEATHER_API' | 'ROAD_AUTHORITY' | 'SENSOR' | 'PREDICTION' | 'CROWD_SOURCE';
  /** 观测数据列表 */
  observations!: Array<{
    type: 'WEATHER' | 'ROAD_STATUS' | 'HAZARD' | 'TRANSPORT';
    location?: {
      lat: number;
      lng: number;
      segmentId?: string;
      regionId?: string;
    };
    data: Record<string, any>;
    confidence: number;
    validityHours: number;
  }>;
}

export class InitializeStateDto {
  /** 行程 ID */
  tripId!: string;
  /** 初始状态 */
  initialState!: ProbabilisticWorldModelContext;
}

// ========== Response Types ==========

export interface BatchObservationResponse {
  /** 导入数量 */
  count: number;
  /** 观测 ID 列表 */
  observationIds: string[];
  /** 处理耗时 (ms) */
  processingTimeMs: number;
}

export interface SubscriptionStatsResponse {
  /** 活跃订阅数 */
  activeSubscriptions: number;
  /** 按行程统计 */
  byTrip: Record<string, number>;
  /** 按事件类型统计 */
  byEventType: Record<string, number>;
}

@ApiTags('Admin - Realtime')
@ApiBearerAuth()
@Controller('v2/admin/realtime')
export class RealtimeAdminController {
  private readonly logger = new Logger(RealtimeAdminController.name);

  constructor(
    private readonly realtimeService: RealtimeWorldStateService,
  ) {}

  // ========== 批量数据导入 ==========

  @Post('observations/batch')
  @ApiOperation({ 
    summary: '批量导入观测数据',
    description: '从外部数据源批量导入天气、道路等观测数据'
  })
  @ApiResponse({ status: 200, description: '返回导入结果' })
  async batchImportObservations(@Body() dto: BatchObservationDto): Promise<BatchObservationResponse> {
    this.logger.log(`[Admin] 批量导入: ${dto.observations.length} 条 from ${dto.source}`);
    
    const startTime = Date.now();
    const observationIds: string[] = [];
    
    for (const obs of dto.observations) {
      const observation: WorldObservation = {
        observationId: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: obs.type,
        source: dto.source,
        timestamp: new Date().toISOString(),
        location: obs.location,
        data: obs.data,
        confidence: obs.confidence,
        validityHours: obs.validityHours,
      };
      
      await this.realtimeService.submitObservation(observation);
      observationIds.push(observation.observationId);
    }
    
    return {
      count: observationIds.length,
      observationIds,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // ========== 状态管理 ==========

  @Post('state/initialize')
  @ApiOperation({ 
    summary: '初始化行程状态',
    description: '为新行程初始化概率世界状态'
  })
  @ApiResponse({ status: 200, description: '初始化完成' })
  async initializeState(@Body() dto: InitializeStateDto): Promise<{ success: boolean; tripId: string }> {
    this.logger.log(`[Admin] 初始化状态: ${dto.tripId}`);
    this.realtimeService.initializeState(dto.tripId, dto.initialState);
    return { success: true, tripId: dto.tripId };
  }

  @Get('state/:tripId/raw')
  @ApiOperation({ 
    summary: '获取原始状态',
    description: '返回未转换的完整概率世界模型状态'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, description: '返回原始状态' })
  async getRawState(@Param('tripId') tripId: string): Promise<ProbabilisticWorldModelContext | null> {
    return this.realtimeService.getCurrentState(tripId);
  }

  // ========== 订阅统计 ==========

  @Get('subscriptions/stats')
  @ApiOperation({ 
    summary: '获取订阅统计',
    description: '返回实时订阅的统计信息'
  })
  @ApiResponse({ status: 200, description: '返回订阅统计' })
  async getSubscriptionStats(): Promise<SubscriptionStatsResponse> {
    // TODO: 从 RealtimeWorldStateService 获取实际统计
    return {
      activeSubscriptions: 0,
      byTrip: {},
      byEventType: {},
    };
  }
}
