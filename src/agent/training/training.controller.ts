// src/agent/training/training.controller.ts

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TrajectoryCollectionService } from './services/trajectory-collection.service';
import { TrajectoryValidatorService } from './services/trajectory-validator.service';
import { TrainingDataPreparationService } from './services/training-data-preparation.service';
import { TrainingMetricsService } from './services/training-metrics.service';
import { TrainingBatchProcessorService } from './services/training-batch-processor.service';
import { ModelCollapseMonitorService } from './services/model-collapse-monitor.service';
import { TrainingQualityAnalyzerService } from './services/training-quality-analyzer.service';
import {
  CollectTrajectoryDto,
  ValidateTrajectoryDto,
  CollectTrajectoryResponseDto,
  ValidateTrajectoryResponseDto,
} from './dto/trajectory.dto';
import { ApprovalStatus } from '@prisma/client';
import { GateResult } from '../interfaces/trip-plan.interface';
import { ComplianceResult, ExecutionResult } from './interfaces/trajectory.interface';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * TrainingController
 * 
 * Iterative Deployment 训练相关接口
 */
@ApiTags('training')
@Public() // 临时开放测试，生产环境应移除或添加认证
@Controller('training')
export class TrainingController {
  private readonly logger = new Logger(TrainingController.name);

  constructor(
    private readonly collectionService: TrajectoryCollectionService,
    private readonly validatorService: TrajectoryValidatorService,
    private readonly trainingDataPrepService: TrainingDataPreparationService,
    private readonly metricsService: TrainingMetricsService,
    private readonly batchProcessor: TrainingBatchProcessorService,
    private readonly collapseMonitor: ModelCollapseMonitorService,
    private readonly qualityAnalyzer: TrainingQualityAnalyzerService,
  ) {}

  /**
   * 收集轨迹
   */
  @Post('trajectories/collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '收集规划轨迹' })
  @ApiResponse({
    status: 200,
    description: '轨迹收集成功',
    type: CollectTrajectoryResponseDto,
  })
  async collectTrajectory(
    @Body() dto: CollectTrajectoryDto,
  ): Promise<{ success: boolean; data: CollectTrajectoryResponseDto }> {
    this.logger.log(`[TrainingController] 收集轨迹: requestId=${dto.requestId}`);

    try {
      const result = await this.collectionService.collectTrajectory({
        requestId: dto.requestId,
        tripId: dto.tripId,
        plan: dto.plan,
        decisionTrace: dto.decisionTrace,
        researchData: dto.researchData,
        gateResult: dto.gateResult,
        complianceResult: dto.complianceResult,
        modelVersion: dto.modelVersion,
        countryCode: dto.countryCode,
      });

      return {
        success: true,
        data: {
          trajectoryId: result.trajectoryId,
          status: result.status,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 收集轨迹失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 验证轨迹
   */
  @Post('trajectories/:trajectoryId/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证轨迹质量' })
  @ApiParam({ name: 'trajectoryId', description: '轨迹ID' })
  @ApiResponse({
    status: 200,
    description: '验证成功',
    type: ValidateTrajectoryResponseDto,
  })
  async validateTrajectory(
    @Param('trajectoryId') trajectoryId: string,
    @Body() dto: ValidateTrajectoryDto,
  ): Promise<{ success: boolean; data: ValidateTrajectoryResponseDto }> {
    this.logger.log(
      `[TrainingController] 验证轨迹: trajectoryId=${trajectoryId}`,
    );

    try {
      // 如果提供了gateResult和complianceResult，使用它们；否则需要从数据库读取
      // 这里简化处理，假设都提供了
      if (!dto.gateResult || !dto.complianceResult) {
        throw new Error('gateResult 和 complianceResult 必须提供');
      }

      const userApproval = dto.userApproval
        ? (dto.userApproval as ApprovalStatus)
        : undefined;

      const executionResult: ExecutionResult | undefined = dto.executionResult
        ? {
            success: dto.executionResult.success,
            error: dto.executionResult.error,
          }
        : undefined;

      const validationResult = await this.validatorService.validateTrajectory(
        dto.gateResult as GateResult,
        dto.complianceResult as ComplianceResult,
        userApproval,
        executionResult,
      );

      return {
        success: true,
        data: {
          isValid: validationResult.isValid,
          score: validationResult.score,
          reasons: validationResult.reasons,
          validationStatus: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 验证轨迹失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 根据 requestId 查找轨迹
   */
  @Get('trajectories/by-request/:requestId')
  @ApiOperation({ summary: '根据请求ID查找轨迹' })
  @ApiParam({ name: 'requestId', description: '请求ID' })
  @ApiResponse({
    status: 200,
    description: '查找成功',
  })
  async findTrajectoryByRequestId(
    @Param('requestId') requestId: string,
  ): Promise<{ success: boolean; data: { trajectoryId: string | null } }> {
    this.logger.log(
      `[TrainingController] 查找轨迹: requestId=${requestId}`,
    );

    try {
      const result =
        await this.collectionService.findTrajectoryByRequestId(requestId);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 查找轨迹失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 准备训练批次
   */
  @Post('batches/prepare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '准备训练批次（筛选高质量轨迹）' })
  @ApiResponse({
    status: 200,
    description: '训练批次准备成功',
  })
  async prepareTrainingBatch(
    @Body() dto: {
      minScore?: number;
      minReward?: number;
      maxUsageCount?: number;
      batchSize?: number;
      modelVersion?: string;
      countryCode?: string;
    } = {},
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 准备训练批次`);

    try {
      const batch = await this.trainingDataPrepService.prepareTrainingBatch(dto);

      return {
        success: true,
        data: {
          batchId: batch.batchId,
          trajectoryCount: batch.trajectories.length,
          trainingDataCount: batch.trainingData.length,
          stats: batch.stats,
          createdAt: batch.createdAt,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 准备训练批次失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 标记轨迹为已使用
   */
  @Post('batches/:batchId/mark-used')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '标记训练批次中的轨迹为已使用' })
  @ApiParam({ name: 'batchId', description: '批次ID' })
  @ApiResponse({
    status: 200,
    description: '标记成功',
  })
  async markBatchAsUsed(
    @Param('batchId') batchId: string,
    @Body() dto: { trajectoryIds: string[] },
  ): Promise<{ success: boolean }> {
    this.logger.log(
      `[TrainingController] 标记批次为已使用: batchId=${batchId}, count=${dto.trajectoryIds.length}`,
    );

    try {
      await this.trainingDataPrepService.markAsUsed(dto.trajectoryIds, batchId);

      return {
        success: true,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 标记批次失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 导出训练批次为 JSONL 格式
   */
  @Post('batches/:batchId/export/jsonl')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '导出训练批次为 JSONL 格式' })
  @ApiParam({ name: 'batchId', description: '批次ID' })
  @ApiResponse({
    status: 200,
    description: '导出成功',
  })
  async exportBatchToJSONL(
    @Param('batchId') batchId: string,
    @Body() dto: { outputPath?: string } = {},
  ): Promise<{ success: boolean; data: { filePath: string; lineCount: number } }> {
    this.logger.log(`[TrainingController] 导出批次为 JSONL: batchId=${batchId}`);

    try {
      // 重新准备批次（或从缓存获取）
      const batch = await this.trainingDataPrepService.prepareTrainingBatch({
        // 可以根据 batchId 查询，这里简化处理
      });

      const outputPath =
        dto.outputPath ||
        `./exports/training_batch_${batchId}_${Date.now()}.jsonl`;

      const result = await this.trainingDataPrepService.exportToJSONL(
        batch,
        outputPath,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 导出 JSONL 失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 导出训练批次为 JSON 格式
   */
  @Post('batches/:batchId/export/json')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '导出训练批次为 JSON 格式' })
  @ApiParam({ name: 'batchId', description: '批次ID' })
  @ApiResponse({
    status: 200,
    description: '导出成功',
  })
  async exportBatchToJSON(
    @Param('batchId') batchId: string,
    @Body() dto: { outputPath?: string } = {},
  ): Promise<{ success: boolean; data: { filePath: string; recordCount: number } }> {
    this.logger.log(`[TrainingController] 导出批次为 JSON: batchId=${batchId}`);

    try {
      // 重新准备批次（或从缓存获取）
      const batch = await this.trainingDataPrepService.prepareTrainingBatch({
        // 可以根据 batchId 查询，这里简化处理
      });

      const outputPath =
        dto.outputPath ||
        `./exports/training_batch_${batchId}_${Date.now()}.json`;

      const result = await this.trainingDataPrepService.exportToJSON(
        batch,
        outputPath,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 导出 JSON 失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 获取轨迹收集统计
   */
  @Get('metrics/collection-stats')
  @ApiOperation({ summary: '获取轨迹收集统计' })
  @ApiResponse({
    status: 200,
    description: '统计成功',
  })
  async getCollectionStats(
    @Body() dto: {
      startDate?: string;
      endDate?: string;
      modelVersion?: string;
      countryCode?: string;
    } = {},
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 获取收集统计`);

    try {
      const stats = await this.metricsService.getCollectionStats({
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        modelVersion: dto.modelVersion,
        countryCode: dto.countryCode,
      });

      return {
        success: true,
        data: stats,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取统计失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 获取训练数据质量指标
   */
  @Get('metrics/training-quality')
  @ApiOperation({ summary: '获取训练数据质量指标' })
  @ApiResponse({
    status: 200,
    description: '指标获取成功',
  })
  async getTrainingQuality(
    @Body() dto: {
      minScore?: number;
      minReward?: number;
    } = {},
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 获取训练数据质量指标`);

    try {
      const quality = await this.metricsService.getTrainingDataQuality({
        minScore: dto.minScore,
        minReward: dto.minReward,
      });

      return {
        success: true,
        data: quality,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取质量指标失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 创建批量处理任务（异步）
   */
  @Post('batches/process-async')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '创建异步批量处理任务' })
  @ApiResponse({
    status: 202,
    description: '任务已创建，正在异步处理',
  })
  async createBatchTask(
    @Body() dto: {
      minScore?: number;
      minReward?: number;
      maxUsageCount?: number;
      batchSize?: number;
      modelVersion?: string;
      countryCode?: string;
      exportFormat?: 'jsonl' | 'json' | 'both' | 'none';
      outputPath?: string;
    },
  ): Promise<{ success: boolean; data: { taskId: string; status: string } }> {
    this.logger.log(`[TrainingController] 创建批量处理任务`);

    try {
      const task = await this.batchProcessor.createBatchTask(dto);

      return {
        success: true,
        data: {
          taskId: task.taskId,
          status: task.status,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 创建任务失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 获取任务状态
   */
  @Get('batches/tasks/:taskId')
  @ApiOperation({ summary: '获取批量处理任务状态' })
  @ApiParam({ name: 'taskId', description: '任务ID' })
  @ApiResponse({
    status: 200,
    description: '任务状态',
  })
  async getTaskStatus(
    @Param('taskId') taskId: string,
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 获取任务状态: taskId=${taskId}`);

    try {
      const task = this.batchProcessor.getTaskStatus(taskId);

      if (!task) {
        return {
          success: false,
          data: { error: 'Task not found' },
        };
      }

      return {
        success: true,
        data: {
          taskId: task.taskId,
          status: task.status,
          progress: task.progress,
          currentStage: task.currentStage,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          error: task.error,
          result: task.result
            ? {
                batchId: task.result.batch.batchId,
                trajectoryCount: task.result.batch.trajectories.length,
                exports: task.result.exports,
              }
            : null,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取任务状态失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 获取所有任务
   */
  @Get('batches/tasks')
  @ApiOperation({ summary: '获取所有批量处理任务' })
  @ApiResponse({
    status: 200,
    description: '任务列表',
  })
  async getAllTasks(): Promise<{ success: boolean; data: any[] }> {
    this.logger.log(`[TrainingController] 获取所有任务`);

    try {
      const tasks = this.batchProcessor.getAllTasks();

      return {
        success: true,
        data: tasks.map((task) => ({
          taskId: task.taskId,
          status: task.status,
          progress: task.progress,
          currentStage: task.currentStage,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        })),
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取任务列表失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 检测 Model Collapse 风险
   */
  @Get('monitoring/collapse-risk')
  @ApiOperation({ summary: '检测 Model Collapse 风险' })
  @ApiResponse({
    status: 200,
    description: '风险检测成功',
  })
  async detectCollapseRisk(
    @Body() dto: {
      modelVersion?: string;
      lookbackDays?: number;
      minTrajectories?: number;
    } = {},
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 检测 Model Collapse 风险`);

    try {
      const report = await this.collapseMonitor.detectCollapseRisk({
        modelVersion: dto.modelVersion,
        lookbackDays: dto.lookbackDays,
        minTrajectories: dto.minTrajectories,
      });

      return {
        success: true,
        data: report,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 检测 Model Collapse 风险失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 分析训练数据质量
   */
  @Get('analysis/quality')
  @ApiOperation({ summary: '分析训练数据质量' })
  @ApiResponse({
    status: 200,
    description: '质量分析成功',
  })
  async analyzeQuality(
    @Body() dto: {
      startDate?: string;
      endDate?: string;
      modelVersion?: string;
      countryCode?: string;
      minScore?: number;
      minReward?: number;
    } = {},
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 分析训练数据质量`);

    try {
      const report = await this.qualityAnalyzer.analyzeQuality({
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        modelVersion: dto.modelVersion,
        countryCode: dto.countryCode,
        minScore: dto.minScore,
        minReward: dto.minReward,
      });

      return {
        success: true,
        data: report,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 分析训练数据质量失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
}
