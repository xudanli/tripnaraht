// src/trips/decision/optimization/controllers/ab-testing.controller.ts
/**
 * A/B 测试 API Controller
 * 
 * 提供：
 * - 实验管理（创建、启动、停止）
 * - 用户分配
 * - 指标记录
 * - 实验分析
 */

import { Controller, Post, Get, Patch, Body, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

import { ABTestingService } from '../experiments/ab-testing.service';
import {
  ExperimentConfig,
  ExperimentVariant,
  ExperimentStatus,
  MetricDefinition,
  MetricObservation,
  UserAllocation,
  ExperimentAnalysis,
  AllocationStrategy,
} from '../experiments/ab-testing.interface';
import { ObjectiveFunctionWeights } from '../objective-function.interface';

// ========== DTOs ==========

class CreateExperimentDto {
  name!: string;
  description!: string;
  hypothesis!: string;
  variants!: Array<{
    variantId: string;
    name: string;
    description: string;
    isControl: boolean;
    trafficAllocation: number;
    weights: ObjectiveFunctionWeights;
    config?: Record<string, any>;
  }>;
  metrics!: Array<{
    metricId: string;
    name: string;
    type: 'CONTINUOUS' | 'BINARY' | 'COUNT' | 'RATIO';
    isPrimary: boolean;
    direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
    minimumDetectableEffect: number;
    calculation: string;
  }>;
  allocationStrategy!: AllocationStrategy;
  targetSampleSize!: number;
  significanceLevel?: number;
  statisticalPower?: number;
  plannedStartDate!: string;
  plannedEndDate!: string;
  enableEarlyStopping?: boolean;
  earlyStoppingThreshold?: number;
  userFilter?: {
    countries?: string[];
    fitnessLevels?: string[];
    experienceLevels?: string[];
    minTrips?: number;
  };
  createdBy!: string;
}

class RecordMetricDto {
  experimentId!: string;
  variantId!: string;
  userId!: string;
  metricId!: string;
  value!: number;
  metadata?: Record<string, any>;
}

@ApiTags('A/B Testing')
@Controller('v2/experiments')
export class ABTestingController {
  private readonly logger = new Logger(ABTestingController.name);

  constructor(
    private readonly abTestingService: ABTestingService,
  ) {}

  // ========== 实验管理 ==========

  @Post()
  @ApiOperation({ summary: '创建实验' })
  @ApiResponse({ status: 201, description: '返回创建的实验配置' })
  async createExperiment(@Body() dto: CreateExperimentDto): Promise<ExperimentConfig> {
    this.logger.log(`[ABTesting] 创建实验: ${dto.name}`);
    
    return this.abTestingService.createExperiment({
      name: dto.name,
      description: dto.description,
      hypothesis: dto.hypothesis,
      status: 'DRAFT',  // 新创建的实验默认为草稿状态
      variants: dto.variants,
      metrics: dto.metrics,
      allocationStrategy: dto.allocationStrategy,
      targetSampleSize: dto.targetSampleSize,
      significanceLevel: dto.significanceLevel || 0.05,
      statisticalPower: dto.statisticalPower || 0.8,
      plannedStartDate: dto.plannedStartDate,
      plannedEndDate: dto.plannedEndDate,
      enableEarlyStopping: dto.enableEarlyStopping || false,
      earlyStoppingThreshold: dto.earlyStoppingThreshold,
      userFilter: dto.userFilter,
      createdBy: dto.createdBy,
    });
  }

  @Get()
  @ApiOperation({ summary: '获取实验列表' })
  @ApiQuery({ name: 'status', description: '实验状态过滤', required: false })
  async listExperiments(
    @Query('status') status?: ExperimentStatus,
  ): Promise<ExperimentConfig[]> {
    return this.abTestingService.listExperiments(status);
  }

  @Get(':experimentId')
  @ApiOperation({ summary: '获取实验详情' })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  async getExperiment(@Param('experimentId') experimentId: string): Promise<ExperimentConfig | null> {
    return this.abTestingService.getExperiment(experimentId);
  }

  @Patch(':experimentId/start')
  @ApiOperation({ summary: '启动实验' })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  async startExperiment(@Param('experimentId') experimentId: string): Promise<{ success: boolean }> {
    this.logger.log(`[ABTesting] 启动实验: ${experimentId}`);
    await this.abTestingService.startExperiment(experimentId);
    return { success: true };
  }

  @Patch(':experimentId/pause')
  @ApiOperation({ summary: '暂停实验' })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  async pauseExperiment(@Param('experimentId') experimentId: string): Promise<{ success: boolean }> {
    this.logger.log(`[ABTesting] 暂停实验: ${experimentId}`);
    await this.abTestingService.pauseExperiment(experimentId);
    return { success: true };
  }

  @Patch(':experimentId/stop')
  @ApiOperation({ summary: '停止实验' })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  async stopExperiment(
    @Param('experimentId') experimentId: string,
    @Body() body: { reason: string },
  ): Promise<{ success: boolean }> {
    this.logger.log(`[ABTesting] 停止实验: ${experimentId}, 原因: ${body.reason}`);
    await this.abTestingService.stopExperiment(experimentId, body.reason);
    return { success: true };
  }

  // ========== 用户分配 ==========

  @Post(':experimentId/allocate/:userId')
  @ApiOperation({ summary: '分配用户到变体' })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  async allocateUser(
    @Param('experimentId') experimentId: string,
    @Param('userId') userId: string,
  ): Promise<UserAllocation> {
    this.logger.log(`[ABTesting] 分配用户: ${userId} -> ${experimentId}`);
    return this.abTestingService.allocateUser(experimentId, userId);
  }

  @Get(':experimentId/variant/:userId')
  @ApiOperation({ summary: '获取用户所属变体' })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  async getUserVariant(
    @Param('experimentId') experimentId: string,
    @Param('userId') userId: string,
  ): Promise<ExperimentVariant | null> {
    return this.abTestingService.getUserVariant(experimentId, userId);
  }

  // ========== 指标记录 ==========

  @Post('metrics')
  @ApiOperation({ summary: '记录指标观测' })
  async recordMetric(@Body() dto: RecordMetricDto): Promise<{ success: boolean }> {
    this.logger.log(`[ABTesting] 记录指标: ${dto.metricId} for ${dto.userId}`);
    
    await this.abTestingService.recordObservation({
      experimentId: dto.experimentId,
      variantId: dto.variantId,
      userId: dto.userId,
      metricId: dto.metricId,
      value: dto.value,
      metadata: dto.metadata,
    });
    
    return { success: true };
  }

  @Post('metrics/batch')
  @ApiOperation({ summary: '批量记录指标观测' })
  async recordMetricBatch(@Body() dtos: RecordMetricDto[]): Promise<{ count: number }> {
    this.logger.log(`[ABTesting] 批量记录指标: ${dtos.length} 条`);
    
    for (const dto of dtos) {
      await this.abTestingService.recordObservation({
        experimentId: dto.experimentId,
        variantId: dto.variantId,
        userId: dto.userId,
        metricId: dto.metricId,
        value: dto.value,
        metadata: dto.metadata,
      });
    }
    
    return { count: dtos.length };
  }

  // ========== 实验分析 ==========

  @Get(':experimentId/analysis')
  @ApiOperation({ summary: '分析实验结果' })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  async analyzeExperiment(@Param('experimentId') experimentId: string): Promise<ExperimentAnalysis> {
    this.logger.log(`[ABTesting] 分析实验: ${experimentId}`);
    return this.abTestingService.analyzeExperiment(experimentId);
  }

  @Get(':experimentId/early-stopping')
  @ApiOperation({ summary: '检查早停条件' })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  async checkEarlyStopping(@Param('experimentId') experimentId: string): Promise<{
    shouldStop: boolean;
    reason?: string;
    winningVariant?: string;
  }> {
    return this.abTestingService.checkEarlyStopping(experimentId);
  }

  @Get(':experimentId/summary')
  @ApiOperation({ summary: '获取实验摘要（适合 UI 展示）' })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  async getExperimentSummary(@Param('experimentId') experimentId: string): Promise<{
    experimentId: string;
    name: string;
    status: string;
    progress: {
      currentSampleSize: number;
      targetSampleSize: number;
      percentComplete: number;
    };
    primaryMetric: {
      metricId: string;
      metricName: string;
      controlMean: number;
      treatmentMean: number;
      isSignificant: boolean;
      pValue: number;
      relativeUplift: number;
    } | null;
    recommendation: string;
    winningVariant: string | null;
  }> {
    const experiment = await this.abTestingService.getExperiment(experimentId);
    const analysis = await this.abTestingService.analyzeExperiment(experimentId);
    
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }
    
    const primaryMetric = experiment.metrics.find(m => m.isPrimary);
    let primaryMetricResult = null;
    
    if (primaryMetric && analysis.testResults[primaryMetric.metricId]?.length > 0) {
      const test = analysis.testResults[primaryMetric.metricId][0];
      const controlStats = analysis.variantStatistics.find(v => v.variantId === test.control);
      const treatmentStats = analysis.variantStatistics.find(v => v.variantId === test.treatment);
      
      primaryMetricResult = {
        metricId: primaryMetric.metricId,
        metricName: primaryMetric.name,
        controlMean: controlStats?.metrics[primaryMetric.metricId]?.mean || 0,
        treatmentMean: treatmentStats?.metrics[primaryMetric.metricId]?.mean || 0,
        isSignificant: test.result.isSignificant,
        pValue: test.result.pValue,
        relativeUplift: test.result.relativeUplift,
      };
    }
    
    return {
      experimentId: experiment.experimentId,
      name: experiment.name,
      status: analysis.status,
      progress: analysis.progress,
      primaryMetric: primaryMetricResult,
      recommendation: analysis.recommendation,
      winningVariant: analysis.winningVariant || null,
    };
  }
}
