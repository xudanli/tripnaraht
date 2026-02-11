// src/trips/decision/optimization/controllers/admin/optimization-admin.controller.ts
/**
 * 管理端 - 优化系统管理 API
 * 
 * 提供系统监控、批量学习、统计分析功能
 */

import { Controller, Post, Get, Body, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../../../../auth/decorators/public.decorator';

import { ObjectiveFunctionService } from '../../objective-function.service';
import { ObjectiveFunctionWeights, DEFAULT_OBJECTIVE_WEIGHTS } from '../../objective-function.interface';
import { WeightLearnerService, WeightLearningResult, DEFAULT_LEARNING_CONFIG } from '../../learning/weight-learner.service';
import { WeightPersistenceService } from '../../learning/weight-persistence.service';

// ========== Request DTOs ==========

export class BatchLearnDto {
  /** 用户 ID 列表（可选，为空则学习所有用户） */
  userIds?: string[];
  /** 最小反馈数量阈值 */
  minFeedbackCount?: number;
  /** 学习配置覆盖 */
  configOverrides?: {
    learningRate?: number;
    minSamples?: number;
  };
}

export class UpdateDefaultWeightsDto {
  /** 新的默认权重 */
  weights!: ObjectiveFunctionWeights;
  /** 修改原因 */
  reason!: string;
  /** 操作者 ID */
  operatorId!: string;
}

// ========== Response Types ==========

export interface SystemStatsResponse {
  /** 持久化统计 */
  persistence: {
    totalUsers: number;
    totalFeedback: number;
    totalLearningRuns: number;
    avgFeedbackPerUser: number;
  };
  /** 当前默认权重 */
  currentWeights: ObjectiveFunctionWeights;
  /** 系统健康状态 */
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: string;
  };
}

export interface BatchLearnResponse {
  /** 学习的用户数 */
  usersProcessed: number;
  /** 成功数 */
  successCount: number;
  /** 失败数 */
  failedCount: number;
  /** 各用户结果 */
  results: Array<{
    userId: string;
    success: boolean;
    confidence?: number;
    error?: string;
  }>;
}

export interface LearningHistoryResponse {
  /** 用户 ID */
  userId: string;
  /** 历史记录 */
  history: Array<{
    timestamp: string;
    previousWeights: ObjectiveFunctionWeights;
    updatedWeights: ObjectiveFunctionWeights;
    confidence: number;
    feedbackCount: number;
  }>;
  /** 当前权重 */
  currentWeights: ObjectiveFunctionWeights;
}

@ApiTags('Admin - Optimization')
@ApiBearerAuth()
@Controller('v2/admin/optimization')
export class OptimizationAdminController {
  private readonly logger = new Logger(OptimizationAdminController.name);

  constructor(
    private readonly objectiveFunction: ObjectiveFunctionService,
    private readonly weightLearner: WeightLearnerService,
    private readonly weightPersistence: WeightPersistenceService,
  ) {}

  // ========== 系统监控 ==========

  @Public()
  @Get('stats')
  @ApiOperation({ 
    summary: '获取系统统计',
    description: '返回优化系统的整体统计信息（公开接口，无需认证）'
  })
  @ApiResponse({ status: 200, description: '返回系统统计' })
  async getStats(): Promise<SystemStatsResponse> {
    const persistenceStats = await this.weightPersistence.getStatistics();
    
    return {
      persistence: persistenceStats,
      currentWeights: this.objectiveFunction.weights,
      health: {
        status: 'healthy',
        lastCheck: new Date().toISOString(),
      },
    };
  }

  @Public()
  @Get('health')
  @ApiOperation({ 
    summary: '健康检查',
    description: '检查优化系统各组件的健康状态（公开接口，无需认证）'
  })
  @ApiResponse({ status: 200, description: '返回健康状态' })
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, { healthy: boolean; message?: string }>;
    timestamp: string;
  }> {
    const services: Record<string, { healthy: boolean; message?: string }> = {
      objectiveFunction: { healthy: true },
      weightLearner: { healthy: true },
      persistence: { healthy: true },
    };
    
    // 检查持久化服务
    try {
      await this.weightPersistence.getStatistics();
    } catch (e: any) {
      services.persistence = { healthy: false, message: e.message };
    }
    
    const allHealthy = Object.values(services).every(s => s.healthy);
    const someHealthy = Object.values(services).some(s => s.healthy);
    
    return {
      status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
      services,
      timestamp: new Date().toISOString(),
    };
  }

  // ========== 批量学习 ==========

  @Post('learn/batch')
  @ApiOperation({ 
    summary: '批量权重学习',
    description: '为多个用户执行权重学习任务'
  })
  @ApiResponse({ status: 200, description: '返回批量学习结果' })
  async batchLearn(@Body() dto: BatchLearnDto): Promise<BatchLearnResponse> {
    this.logger.log(`[Admin] 批量学习: ${dto.userIds?.length || 'all'} 用户`);
    
    // 获取目标用户列表
    let userIds = dto.userIds;
    if (!userIds || userIds.length === 0) {
      const stats = await this.weightPersistence.getStatistics();
      // 假设有方法获取所有用户 ID
      userIds = []; // TODO: 从持久化服务获取
    }
    
    const results: BatchLearnResponse['results'] = [];
    let successCount = 0;
    let failedCount = 0;
    
    for (const userId of userIds) {
      try {
        const feedbackHistory = await this.weightPersistence.loadFeedbackHistory(
          userId,
          dto.minFeedbackCount || 10,
        );
        
        if (feedbackHistory.length < (dto.minFeedbackCount || 10)) {
          results.push({
            userId,
            success: false,
            error: `反馈不足: ${feedbackHistory.length}/${dto.minFeedbackCount || 10}`,
          });
          failedCount++;
          continue;
        }
        
        const config = {
          ...DEFAULT_LEARNING_CONFIG,
          ...dto.configOverrides,
        };
        
        const result = await this.weightLearner.learnFromFeedback(userId, feedbackHistory, config);
        
        await this.weightPersistence.saveLearningResult(userId, result);
        await this.weightPersistence.saveUserProfile(userId, {
          userId,
          currentWeights: result.updatedWeights,
          weightHistory: [],
          totalFeedback: feedbackHistory.length,
          learningConfidence: result.confidence,
          lastUpdated: new Date().toISOString(),
        });
        
        results.push({
          userId,
          success: true,
          confidence: result.confidence,
        });
        successCount++;
      } catch (e: any) {
        results.push({
          userId,
          success: false,
          error: e.message,
        });
        failedCount++;
      }
    }
    
    return {
      usersProcessed: userIds.length,
      successCount,
      failedCount,
      results,
    };
  }

  @Post('learn/:userId')
  @ApiOperation({ 
    summary: '单用户权重学习',
    description: '为指定用户执行权重学习'
  })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  @ApiResponse({ status: 200, description: '返回学习结果' })
  async learnForUser(
    @Param('userId') userId: string,
    @Query('feedbackCount') feedbackCount?: number,
  ): Promise<WeightLearningResult> {
    this.logger.log(`[Admin] 单用户学习: ${userId}`);
    
    const feedbackHistory = await this.weightPersistence.loadFeedbackHistory(
      userId,
      feedbackCount || 50,
    );
    
    const result = await this.weightLearner.learnFromFeedback(
      userId,
      feedbackHistory,
      DEFAULT_LEARNING_CONFIG,
    );
    
    await this.weightPersistence.saveLearningResult(userId, result);
    
    return result;
  }

  // ========== 学习历史 ==========

  @Get('learning-history/:userId')
  @ApiOperation({ 
    summary: '获取学习历史',
    description: '返回用户的权重学习历史记录'
  })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  @ApiResponse({ status: 200, description: '返回学习历史' })
  async getLearningHistory(@Param('userId') userId: string): Promise<LearningHistoryResponse> {
    const history = await this.weightPersistence.getLearningHistory(userId);
    const profile = await this.weightPersistence.loadUserProfile(userId);
    
    return {
      userId,
      history: history.map(h => ({
        timestamp: h.timestamp,
        // 从更新后的权重和变化量反推之前的权重
        previousWeights: h.result.weightChanges 
          ? this.computePreviousWeights(h.result.updatedWeights, h.result.weightChanges)
          : h.result.updatedWeights,
        updatedWeights: h.result.updatedWeights,
        confidence: h.result.confidence,
        feedbackCount: h.result.samplesUsed,
      })),
      currentWeights: profile?.currentWeights || DEFAULT_OBJECTIVE_WEIGHTS,
    };
  }

  // ========== 默认权重管理 ==========

  @Public()
  @Get('default-weights')
  @ApiOperation({ 
    summary: '获取默认权重',
    description: '返回系统当前的默认权重配置（公开接口，无需认证）'
  })
  @ApiResponse({ status: 200, description: '返回默认权重' })
  async getDefaultWeights(): Promise<{ weights: ObjectiveFunctionWeights; lastUpdated: string }> {
    return {
      weights: this.objectiveFunction.weights,
      lastUpdated: new Date().toISOString(),
    };
  }

  @Post('default-weights')
  @ApiOperation({ 
    summary: '更新默认权重',
    description: '修改系统默认权重配置（谨慎操作）'
  })
  @ApiResponse({ status: 200, description: '权重已更新' })
  async updateDefaultWeights(@Body() dto: UpdateDefaultWeightsDto): Promise<{
    success: boolean;
    previousWeights: ObjectiveFunctionWeights;
    newWeights: ObjectiveFunctionWeights;
  }> {
    this.logger.warn(`[Admin] 更新默认权重 by ${dto.operatorId}: ${dto.reason}`);
    
    const previousWeights = { ...this.objectiveFunction.weights };
    this.objectiveFunction.updateWeights(dto.weights);
    
    return {
      success: true,
      previousWeights,
      newWeights: this.objectiveFunction.weights,
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 从更新后的权重和变化量反推之前的权重
   */
  private computePreviousWeights(
    updatedWeights: ObjectiveFunctionWeights,
    changes: Partial<ObjectiveFunctionWeights>,
  ): ObjectiveFunctionWeights {
    const previous = { ...updatedWeights };
    for (const key of Object.keys(changes) as Array<keyof ObjectiveFunctionWeights>) {
      if (changes[key] !== undefined) {
        previous[key] = updatedWeights[key] - (changes[key] || 0);
      }
    }
    return previous;
  }
}
