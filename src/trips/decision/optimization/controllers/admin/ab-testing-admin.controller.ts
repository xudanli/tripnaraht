// src/trips/decision/optimization/controllers/admin/ab-testing-admin.controller.ts
/**
 * 管理端 - A/B 测试 API
 * 
 * 提供实验管理、数据分析功能
 */

import { Controller, Post, Get, Patch, Body, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';

import { ABTestingService } from '../../experiments/ab-testing.service';
import {
  ExperimentConfig,
  ExperimentStatus,
  ExperimentAnalysis,
  AllocationStrategy,
} from '../../experiments/ab-testing.interface';
import { ObjectiveFunctionWeights } from '../../objective-function.interface';

// ========== Request DTOs ==========

export class CreateExperimentDto {
  /** 实验名称 */
  name!: string;
  /** 实验描述 */
  description!: string;
  /** 假设 */
  hypothesis!: string;
  /** 变体配置 */
  variants!: Array<{
    /** 变体 ID */
    variantId: string;
    /** 变体名称 */
    name: string;
    /** 描述 */
    description: string;
    /** 是否为对照组 */
    isControl: boolean;
    /** 流量分配比例 (0-1) */
    trafficAllocation: number;
    /** 该变体使用的权重 */
    weights: ObjectiveFunctionWeights;
    /** 其他配置 */
    config?: Record<string, any>;
  }>;
  /** 指标定义 */
  metrics!: Array<{
    /** 指标 ID */
    metricId: string;
    /** 指标名称 */
    name: string;
    /** 指标类型 */
    type: 'CONTINUOUS' | 'BINARY' | 'COUNT' | 'RATIO';
    /** 是否为主指标 */
    isPrimary: boolean;
    /** 优化方向 */
    direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
    /** 最小可检测效应 */
    minimumDetectableEffect: number;
    /** 计算公式说明 */
    calculation: string;
  }>;
  /** 分配策略 */
  allocationStrategy!: AllocationStrategy;
  /** 目标样本量 */
  targetSampleSize!: number;
  /** 显著性水平 (默认 0.05) */
  significanceLevel?: number;
  /** 统计功效 (默认 0.8) */
  statisticalPower?: number;
  /** 计划开始日期 */
  plannedStartDate!: string;
  /** 计划结束日期 */
  plannedEndDate!: string;
  /** 是否启用早停 */
  enableEarlyStopping?: boolean;
  /** 早停阈值 */
  earlyStoppingThreshold?: number;
  /** 用户筛选条件 */
  userFilter?: {
    countries?: string[];
    fitnessLevels?: string[];
    experienceLevels?: string[];
    minTrips?: number;
  };
  /** 创建者 ID */
  createdBy!: string;
}

export class StopExperimentDto {
  /** 停止原因 */
  reason!: string;
  /** 操作者 ID */
  operatorId!: string;
}

// ========== Response Types ==========

export interface ExperimentSummary {
  /** 实验 ID */
  experimentId: string;
  /** 名称 */
  name: string;
  /** 状态 */
  status: ExperimentStatus;
  /** 进度 */
  progress: {
    currentSampleSize: number;
    targetSampleSize: number;
    percentComplete: number;
    daysRemaining: number;
  };
  /** 主指标结果 */
  primaryMetric: {
    metricId: string;
    metricName: string;
    controlMean: number;
    treatmentMean: number;
    relativeUplift: number;
    pValue: number;
    isSignificant: boolean;
  } | null;
  /** 推荐决策 */
  recommendation: string;
  /** 获胜变体 */
  winningVariant: string | null;
}

export interface ExperimentListResponse {
  /** 实验列表 */
  experiments: ExperimentSummary[];
  /** 总数 */
  total: number;
  /** 按状态统计 */
  byStatus: Record<ExperimentStatus, number>;
}

@ApiTags('Admin - A/B Testing')
@ApiBearerAuth()
@Controller('v2/admin/experiments')
export class ABTestingAdminController {
  private readonly logger = new Logger(ABTestingAdminController.name);

  constructor(
    private readonly abTestingService: ABTestingService,
  ) {}

  // ========== 实验管理 ==========

  @Post()
  @ApiOperation({ 
    summary: '创建实验',
    description: '创建新的 A/B 测试实验'
  })
  @ApiResponse({ status: 201, description: '返回创建的实验' })
  async createExperiment(@Body() dto: CreateExperimentDto): Promise<ExperimentConfig> {
    this.logger.log(`[Admin] 创建实验: ${dto.name} by ${dto.createdBy}`);
    
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
  @ApiOperation({ 
    summary: '获取实验列表',
    description: '返回所有实验的摘要列表'
  })
  @ApiQuery({ name: 'status', description: '状态过滤', required: false })
  @ApiResponse({ status: 200, description: '返回实验列表' })
  async listExperiments(
    @Query('status') status?: ExperimentStatus,
  ): Promise<ExperimentListResponse> {
    const experiments = await this.abTestingService.listExperiments(status);
    
    const summaries: ExperimentSummary[] = [];
    const byStatus: Record<string, number> = {
      DRAFT: 0,
      RUNNING: 0,
      PAUSED: 0,
      COMPLETED: 0,
      STOPPED: 0,
    };
    
    for (const exp of experiments) {
      byStatus[exp.status] = (byStatus[exp.status] || 0) + 1;
      
      const analysis = await this.abTestingService.analyzeExperiment(exp.experimentId);
      const primaryMetric = exp.metrics.find(m => m.isPrimary);
      
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
          relativeUplift: test.result.relativeUplift,
          pValue: test.result.pValue,
          isSignificant: test.result.isSignificant,
        };
      }
      
      const plannedEnd = new Date(exp.plannedEndDate);
      const daysRemaining = Math.max(0, Math.ceil((plannedEnd.getTime() - Date.now()) / 86400000));
      
      summaries.push({
        experimentId: exp.experimentId,
        name: exp.name,
        status: exp.status,
        progress: {
          ...analysis.progress,
          daysRemaining,
        },
        primaryMetric: primaryMetricResult,
        recommendation: analysis.recommendation,
        winningVariant: analysis.winningVariant || null,
      });
    }
    
    return {
      experiments: summaries,
      total: experiments.length,
      byStatus: byStatus as Record<ExperimentStatus, number>,
    };
  }

  @Get(':experimentId')
  @ApiOperation({ 
    summary: '获取实验详情',
    description: '返回实验的完整配置和当前状态'
  })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  @ApiResponse({ status: 200, description: '返回实验详情' })
  async getExperiment(@Param('experimentId') experimentId: string): Promise<ExperimentConfig | null> {
    return this.abTestingService.getExperiment(experimentId);
  }

  // ========== 实验控制 ==========

  @Patch(':experimentId/start')
  @ApiOperation({ 
    summary: '启动实验',
    description: '将实验从 DRAFT 状态启动为 RUNNING'
  })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  @ApiResponse({ status: 200, description: '实验已启动' })
  async startExperiment(@Param('experimentId') experimentId: string): Promise<{ success: boolean; status: ExperimentStatus }> {
    this.logger.log(`[Admin] 启动实验: ${experimentId}`);
    await this.abTestingService.startExperiment(experimentId);
    return { success: true, status: 'RUNNING' };
  }

  @Patch(':experimentId/pause')
  @ApiOperation({ 
    summary: '暂停实验',
    description: '暂停正在运行的实验'
  })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  @ApiResponse({ status: 200, description: '实验已暂停' })
  async pauseExperiment(@Param('experimentId') experimentId: string): Promise<{ success: boolean; status: ExperimentStatus }> {
    this.logger.log(`[Admin] 暂停实验: ${experimentId}`);
    await this.abTestingService.pauseExperiment(experimentId);
    return { success: true, status: 'PAUSED' };
  }

  @Patch(':experimentId/stop')
  @ApiOperation({ 
    summary: '停止实验',
    description: '提前终止实验'
  })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  @ApiResponse({ status: 200, description: '实验已停止' })
  async stopExperiment(
    @Param('experimentId') experimentId: string,
    @Body() dto: StopExperimentDto,
  ): Promise<{ success: boolean; status: ExperimentStatus }> {
    this.logger.warn(`[Admin] 停止实验: ${experimentId}, 原因: ${dto.reason} by ${dto.operatorId}`);
    await this.abTestingService.stopExperiment(experimentId, dto.reason);
    return { success: true, status: 'STOPPED' };
  }

  // ========== 数据分析 ==========

  @Get(':experimentId/analysis')
  @ApiOperation({ 
    summary: '获取实验分析',
    description: '返回完整的统计分析结果'
  })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  @ApiResponse({ status: 200, description: '返回分析结果' })
  async getAnalysis(@Param('experimentId') experimentId: string): Promise<ExperimentAnalysis> {
    this.logger.log(`[Admin] 分析实验: ${experimentId}`);
    return this.abTestingService.analyzeExperiment(experimentId);
  }

  @Get(':experimentId/early-stopping')
  @ApiOperation({ 
    summary: '检查早停条件',
    description: '检查是否满足早停条件'
  })
  @ApiParam({ name: 'experimentId', description: '实验 ID' })
  @ApiResponse({ status: 200, description: '返回早停检查结果' })
  async checkEarlyStopping(@Param('experimentId') experimentId: string): Promise<{
    shouldStop: boolean;
    reason?: string;
    winningVariant?: string;
    confidence?: number;
  }> {
    return this.abTestingService.checkEarlyStopping(experimentId);
  }
}
