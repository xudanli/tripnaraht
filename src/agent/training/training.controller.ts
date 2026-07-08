// src/agent/training/training.controller.ts

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { TrajectoryCollectionService } from './services/trajectory-collection.service';
import { TrajectoryValidatorService } from './services/trajectory-validator.service';
import { TrainingDataPreparationService } from './services/training-data-preparation.service';
import { TrajectoryETLService } from './services/trajectory-etl.service';
import { DataQualityCheckerService } from './services/data-quality-checker.service';
import { DatasetVersionManagerService } from './services/dataset-version-manager.service';
import { TrainingPipelineService } from './services/training-pipeline.service';
import { ModelRegistryService } from './services/model-registry.service';
import { PolicyServiceManagerService } from './services/policy-service-manager.service';
import { EvalSuiteService } from './services/eval-suite.service';
import { OfflinePolicyEvaluatorService } from './services/offline-policy-evaluator.service';
import { ReplayComparatorService } from './services/replay-comparator.service';
import { RegressionGateService } from './services/regression-gate.service';
import { TrainingMetricsService } from './services/training-metrics.service';
import { TrainingBatchProcessorService } from './services/training-batch-processor.service';
import { ModelCollapseMonitorService } from './services/model-collapse-monitor.service';
import { TrainingQualityAnalyzerService } from './services/training-quality-analyzer.service';
import { ConstraintsEngineService } from './services/constraints-engine.service';
import { isConstraintAgentNarrateOnlyMode } from '../../decision-runtime/constraints/constraint-agent-narrate-only.util';
import { RiskEventManagerService } from './services/risk-event-manager.service';
import { ComplianceAuditService } from './services/compliance-audit.service';
import { SecurityRedTeamService } from './services/security-red-team.service';
import { RewardDefinitionService } from './services/reward-definition.service';
import { UserFeedbackLoopService } from './services/user-feedback-loop.service';
import { ABTestManagerService } from './services/ab-test-manager.service';
import { ExplainableOutputService } from './services/explainable-output.service';
import { ClarificationPromptDesignerService } from './services/clarification-prompt-designer.service';
import { RiskPromptDesignerService } from './services/risk-prompt-designer.service';
import { DecisionExplanationDesignerService } from './services/decision-explanation-designer.service';
import { DomainExpertKnowledgeService } from './services/domain-expert-knowledge.service';
import { JudgePromptDesignerService } from './services/judge-prompt-designer.service';
import { RewardModelTrainerService } from './services/reward-model-trainer.service';
import { DiagnosticLabelSystemService } from './services/diagnostic-label-system.service';
import { QualityScorerService } from './services/quality-scorer.service';
import { RollMonitoringService } from './services/roll-monitoring.service';
import { RollABTestService } from './services/roll-ab-test.service';
import { IterativeDeploymentWorkflowService } from './services/iterative-deployment-workflow.service';
import { ModelABTestService } from './services/model-ab-test.service';
import {
  CollectTrajectoryDto,
  ValidateTrajectoryDto,
  CollectTrajectoryResponseDto,
  ValidateTrajectoryResponseDto,
} from './dto/trajectory.dto';
import {
  ClassifyRiskEventDto,
  TrackUserActionDto,
  GetClarificationPromptDto,
  GetRiskPromptDto,
  GetRedLineRulesDto,
  ListRedTeamTestCasesDto,
  CreateBatchTaskDto,
} from './dto/training.dto';
import { ApprovalStatus } from '@prisma/client';
import { GateResult } from '../interfaces/trip-plan.interface';
import { ComplianceResult, ExecutionResult, RLTrajectory } from './interfaces/trajectory.interface';
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
    private readonly etlService: TrajectoryETLService,
    private readonly qualityChecker: DataQualityCheckerService,
    private readonly versionManager: DatasetVersionManagerService,
    private readonly trainingPipeline: TrainingPipelineService,
    private readonly modelRegistry: ModelRegistryService,
    private readonly policyService: PolicyServiceManagerService,
    private readonly evalSuite: EvalSuiteService,
    private readonly opeEvaluator: OfflinePolicyEvaluatorService,
    private readonly replayComparator: ReplayComparatorService,
    private readonly regressionGate: RegressionGateService,
    private readonly constraintsEngine: ConstraintsEngineService,
    private readonly riskEventManager: RiskEventManagerService,
    private readonly complianceAudit: ComplianceAuditService,
    private readonly securityRedTeam: SecurityRedTeamService,
    private readonly rewardDefinition: RewardDefinitionService,
    private readonly userFeedbackLoop: UserFeedbackLoopService,
    private readonly abTestManager: ABTestManagerService,
    private readonly explainableOutput: ExplainableOutputService,
    private readonly clarificationPromptDesigner: ClarificationPromptDesignerService,
    private readonly riskPromptDesigner: RiskPromptDesignerService,
    private readonly decisionExplanationDesigner: DecisionExplanationDesignerService,
    private readonly domainExpertKnowledge: DomainExpertKnowledgeService,
    private readonly judgePromptDesigner: JudgePromptDesignerService,
    private readonly rewardModelTrainer: RewardModelTrainerService,
    private readonly diagnosticLabelSystem: DiagnosticLabelSystemService,
    private readonly qualityScorer: QualityScorerService,
    private readonly metricsService: TrainingMetricsService,
    private readonly batchProcessor: TrainingBatchProcessorService,
    private readonly collapseMonitor: ModelCollapseMonitorService,
    private readonly qualityAnalyzer: TrainingQualityAnalyzerService,
    @Optional() private readonly rollMonitoring?: RollMonitoringService,
    @Optional() private readonly rollABTest?: RollABTestService,
    @Optional() private readonly iterativeDeploymentWorkflow?: IterativeDeploymentWorkflowService,
    @Optional() private readonly modelABTest?: ModelABTestService,
  ) {
    if (this.rollMonitoring) {
      this.logger.log('[TrainingController] ROLL 监控已启用');
    }
  }

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
    @Body() dto: CreateBatchTaskDto,
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

  /**
   * ETL: 抽取轨迹数据
   */
  @Post('etl/decision-trajectories/extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PR-C：从 decision_trajectories 抽取 FINALIZED 执行轨迹' })
  async extractDecisionTrajectories(
    @Body()
    dto: {
      ids?: string[];
      request_ids?: string[];
      statuses?: string[];
      orchestration_outcomes?: string[];
      min_total_reward?: number;
      updated_after?: string;
      exclude_critical_fail?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const rows = await this.etlService.extractDecisionTrajectories({
      ...dto,
      statuses: (dto.statuses as any) ?? ['FINALIZED'],
      orchestration_outcomes: dto.orchestration_outcomes as any,
    });
    return {
      success: true,
      data: {
        count: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          request_id: r.requestId,
          orchestration_outcome: r.orchestrationOutcome,
          total_reward: r.totalReward,
          steps: r.payload.orchestration_steps?.length ?? 0,
        })),
      },
    };
  }

  @Post('etl/decision-trajectories/export-training-pack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PR-C：导出 DPO + SFT Repair 训练包（decision_trajectories SSOT）' })
  async exportDecisionTrajectoryTrainingPack(
    @Body()
    dto: {
      request_ids?: string[];
      updated_after?: string;
      limit?: number;
      output_dir?: string;
    } = {},
  ) {
    const result = await this.etlService.exportDecisionTrajectoryTrainingPack(
      {
        request_ids: dto.request_ids,
        updated_after: dto.updated_after,
        limit: dto.limit,
      },
      dto.output_dir ?? './data/training/decision-trajectories',
    );
    return { success: true, data: result };
  }

  @Post('etl/extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '抽取轨迹数据并转换为RL格式' })
  @ApiResponse({
    status: 200,
    description: '轨迹抽取成功',
  })
  async extractTrajectories(
    @Body() dto: {
      trajectory_ids?: string[];
      request_ids?: string[];
      min_validation_score?: number;
      min_total_reward?: number;
      model_version?: string;
      country_code?: string;
      date_range?: { start: string; end: string };
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ success: boolean; data: { count: number; trajectories: any[] } }> {
    this.logger.log(`[TrainingController] ETL抽取轨迹数据`);

    try {
      const trajectories = await this.etlService.extractTrajectories(dto);

      return {
        success: true,
        data: {
          count: trajectories.length,
          trajectories: trajectories.map((t) => ({
            trajectory_id: t.trajectory_id,
            request_id: t.request_id,
            steps_count: t.steps.length,
            metadata: t.metadata,
          })),
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] ETL抽取轨迹失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * ETL: 导出轨迹数据集
   */
  @Post('etl/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '导出轨迹数据集为文件（JSONL/JSON/Parquet）' })
  @ApiResponse({
    status: 200,
    description: '导出成功',
  })
  async exportTrajectories(
    @Body() dto: {
      trajectory_ids?: string[];
      request_ids?: string[];
      min_validation_score?: number;
      min_total_reward?: number;
      model_version?: string;
      country_code?: string;
      date_range?: { start: string; end: string };
      format?: 'jsonl' | 'json' | 'parquet';
      output_dir?: string;
    } = {},
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] ETL导出轨迹数据集: format=${dto.format || 'jsonl'}`);

    try {
      const result = await this.etlService.loadToDataset(
        {
          trajectory_ids: dto.trajectory_ids,
          request_ids: dto.request_ids,
          min_validation_score: dto.min_validation_score,
          min_total_reward: dto.min_total_reward,
          model_version: dto.model_version,
          country_code: dto.country_code,
          date_range: dto.date_range,
        },
        dto.format || 'jsonl',
        dto.output_dir || './data/training',
      );

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] ETL导出失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 数据质量检查
   */
  @Post('quality/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '检查轨迹数据质量' })
  @ApiResponse({
    status: 200,
    description: '质量检查成功',
  })
  async checkDataQuality(
    @Body() dto: {
      trajectory_ids?: string[];
      request_ids?: string[];
      min_validation_score?: number;
      model_version?: string;
      country_code?: string;
    } = {},
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 检查数据质量`);

    try {
      // 先抽取轨迹
      const trajectories = await this.etlService.extractTrajectories(dto);

      // 进行质量检查
      const qualityResult = await this.qualityChecker.validateDataset(trajectories);

      return {
        success: true,
        data: qualityResult,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 数据质量检查失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 数据集版本管理：创建版本
   */
  @Post('versions/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建数据集版本' })
  @ApiResponse({
    status: 200,
    description: '版本创建成功',
  })
  async createDatasetVersion(
    @Body() dto: {
      export_result: any; // ETLExportResult
      quality_result: any; // DataQualityResult
      data_source: {
        date_range?: { start: string; end: string };
        filter_criteria: Record<string, any>;
        total_trajectories: number;
      };
      anonymization?: {
        enabled: boolean;
        config_hash?: string;
      };
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 创建数据集版本`);

    try {
      const version = await this.versionManager.createDatasetVersion(
        dto.export_result,
        dto.quality_result,
        dto.data_source,
        dto.anonymization,
      );

      return {
        success: true,
        data: version,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 创建数据集版本失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 数据集版本管理：获取版本
   */
  @Get('versions/:version')
  @ApiOperation({ summary: '获取指定数据集版本' })
  @ApiParam({ name: 'version', description: '版本号（如v1.0.0）' })
  @ApiResponse({
    status: 200,
    description: '获取版本成功',
  })
  async getDatasetVersion(
    @Param('version') version: string,
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 获取数据集版本: version=${version}`);

    try {
      const datasetVersion = await this.versionManager.getDatasetVersion(version);

      if (!datasetVersion) {
        return {
          success: false,
          data: { message: `版本不存在: ${version}` },
        };
      }

      return {
        success: true,
        data: datasetVersion,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取数据集版本失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 数据集版本管理：列出所有版本
   */
  @Get('versions')
  @ApiOperation({ summary: '列出所有数据集版本' })
  @ApiResponse({
    status: 200,
    description: '列出版本成功',
  })
  async listDatasetVersions(): Promise<{ success: boolean; data: any[] }> {
    this.logger.log(`[TrainingController] 列出所有数据集版本`);

    try {
      const versions = await this.versionManager.listDatasetVersions();

      return {
        success: true,
        data: versions,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 列出数据集版本失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 数据集版本管理：对比版本
   */
  @Get('versions/:version1/compare/:version2')
  @ApiOperation({ summary: '对比两个数据集版本' })
  @ApiParam({ name: 'version1', description: '版本1' })
  @ApiParam({ name: 'version2', description: '版本2' })
  @ApiResponse({
    status: 200,
    description: '对比成功',
  })
  async compareVersions(
    @Param('version1') version1: string,
    @Param('version2') version2: string,
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(
      `[TrainingController] 对比数据集版本: version1=${version1}, version2=${version2}`,
    );

    try {
      const comparison = await this.versionManager.compareVersions(version1, version2);

      return {
        success: true,
        data: comparison,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 对比数据集版本失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 训练平台：创建训练任务
   */
  @Post('jobs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建训练任务' })
  @ApiResponse({
    status: 200,
    description: '训练任务创建成功',
  })
  async createTrainingJob(
    @Body() dto: {
      dataset_version: string;
      model_config: any;
      training_config: any;
      hyperparameter_search?: {
        enabled: boolean;
        search_space: any;
        num_trials?: number;
      };
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 创建训练任务: datasetVersion=${dto.dataset_version}`);

    try {
      const job = await this.trainingPipeline.createTrainingJob(
        dto.dataset_version,
        dto.model_config,
        dto.training_config,
        dto.hyperparameter_search,
      );

      return {
        success: true,
        data: job,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 创建训练任务失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 训练平台：启动训练
   */
  @Post('jobs/:jobId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '启动训练任务' })
  @ApiParam({ name: 'jobId', description: '训练任务ID' })
  async startTraining(
    @Param('jobId') jobId: string,
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 启动训练: jobId=${jobId}`);

    try {
      const job = await this.trainingPipeline.startTraining(jobId);

      return {
        success: true,
        data: job,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 启动训练失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 获取所有枚举选项（统一接口）
   */
  @Get('options/all')
  @ApiOperation({ summary: '获取所有枚举选项' })
  async getAllEnumOptions(): Promise<{ success: boolean; data: Record<string, any[]> }> {
    const { ALL_ENUM_OPTIONS } = await import('./interfaces/enums.interface');
    return {
      success: true,
      data: ALL_ENUM_OPTIONS,
    };
  }

  /**
   * 获取指定枚举选项
   */
  @Get('options/:enumKey')
  @ApiOperation({ summary: '获取指定枚举选项' })
  @ApiParam({ 
    name: 'enumKey', 
    description: '枚举键名',
    enum: ['modelType', 'baseModel', 'trainingStatus', 'trainingType', 'sevLevel', 'riskCategory', 'riskHandleAction', 'riskEventStatus', 'constraintType', 'constraintSeverity', 'constraintAction', 'userActionType', 'decisionType', 'decisionResult', 'evidenceType', 'visualizationType', 'language', 'season', 'timeRange', 'dangerLevel', 'executability', 'riskType', 'incidentType', 'trendType', 'sortOrder']
  })
  async getEnumOptions(
    @Param('enumKey') enumKey: string,
  ): Promise<{ success: boolean; data: any[] }> {
    const { ALL_ENUM_OPTIONS } = await import('./interfaces/enums.interface');
    const options = ALL_ENUM_OPTIONS[enumKey as keyof typeof ALL_ENUM_OPTIONS];
    
    if (!options) {
      return {
        success: false,
        data: [],
      };
    }
    
    return {
      success: true,
      data: options,
    };
  }

  /**
   * 训练平台：获取训练任务状态
   */
  @Get('jobs/:jobId')
  @ApiOperation({ summary: '获取训练任务状态' })
  @ApiParam({ name: 'jobId', description: '训练任务ID' })
  async getTrainingJobStatus(
    @Param('jobId') jobId: string,
  ): Promise<{ success: boolean; data: any }> {
    try {
      const job = await this.trainingPipeline.getTrainingJobStatus(jobId);

      return {
        success: true,
        data: job,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取训练任务状态失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 训练平台：列出所有训练任务
   */
  @Get('jobs')
  @ApiOperation({ summary: '列出所有训练任务' })
  async listTrainingJobs(): Promise<{ success: boolean; data: any[] }> {
    try {
      const jobs = await this.trainingPipeline.listTrainingJobs();

      return {
        success: true,
        data: jobs,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 列出训练任务失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 模型注册表：注册模型
   */
  @Post('models/register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注册模型到Model Registry' })
  async registerModel(
    @Body() dto: {
      model_version: any;
      eval_metrics?: Record<string, number>;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 注册模型: version=${dto.model_version.version}`);

    try {
      const entry = await this.modelRegistry.registerModel(
        dto.model_version,
        dto.eval_metrics,
      );

      return {
        success: true,
        data: entry,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 注册模型失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 模型注册表：获取模型版本
   */
  @Get('models/:version')
  @ApiOperation({ summary: '获取指定模型版本' })
  @ApiParam({ name: 'version', description: '模型版本号' })
  async getModelVersion(
    @Param('version') version: string,
  ): Promise<{ success: boolean; data: any }> {
    try {
      const modelVersion = await this.modelRegistry.getModelVersion(version);

      if (!modelVersion) {
        return {
          success: false,
          data: { message: `Model version not found: ${version}` },
        };
      }

      return {
        success: true,
        data: modelVersion,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取模型版本失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 模型注册表：列出所有模型版本
   */
  @Get('models')
  @ApiOperation({ summary: '列出所有模型版本' })
  async listModelVersions(): Promise<{ success: boolean; data: any[] }> {
    try {
      const versions = await this.modelRegistry.listModelVersions();

      return {
        success: true,
        data: versions,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 列出模型版本失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 模型注册表：回滚到指定版本
   */
  @Post('models/:version/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '回滚模型到指定版本' })
  @ApiParam({ name: 'version', description: '目标版本号' })
  async rollbackModel(
    @Param('version') version: string,
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 回滚模型: version=${version}`);

    try {
      const modelVersion = await this.modelRegistry.rollbackToVersion(version);

      return {
        success: true,
        data: modelVersion,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 回滚模型失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * PolicyService：策略推理
   */
  @Post('policy/predict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PolicyService策略推理' })
  async policyPredict(
    @Body() dto: any,
  ): Promise<{ success: boolean; data: any }> {
    this.logger.debug(`[TrainingController] PolicyService推理: requestId=${dto.request_id}`);

    try {
      const result = await this.policyService.predict(dto);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] PolicyService推理失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * PolicyService：健康检查
   */
  @Get('policy/health')
  @ApiOperation({ summary: 'PolicyService健康检查' })
  async policyHealthCheck(): Promise<{ success: boolean; data: any }> {
    try {
      const health = await this.policyService.healthCheck();

      return {
        success: true,
        data: health,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] PolicyService健康检查失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * PolicyService：获取指标
   */
  @Get('policy/metrics')
  @ApiOperation({ summary: '获取PolicyService指标' })
  async policyMetrics(): Promise<{ success: boolean; data: any }> {
    try {
      const metrics = await this.policyService.getMetrics();

      return {
        success: true,
        data: metrics,
      };
    } catch (error: any) {
      this.logger.warn(
        `[TrainingController] PolicyService不可用，返回降级数据: ${error?.message}`,
      );
      // 返回降级数据而不是抛出异常
      return {
        success: true,
        data: {
          qps: 0,
          p50_latency_ms: 0,
          p95_latency_ms: 0,
          p99_latency_ms: 0,
          error_rate: 0,
          total_requests: 0,
          total_errors: 0,
          model_versions: {},
          status: 'unavailable',
          message: 'PolicyService is not running',
        },
      };
    }
  }

  /**
   * PolicyService：部署模型
   */
  @Post('policy/deploy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '部署模型到PolicyService' })
  async deployPolicyModel(
    @Body() dto: { model_version: string },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 部署模型到PolicyService: version=${dto.model_version}`);

    try {
      await this.policyService.deployModel(dto.model_version);

      return {
        success: true,
        data: { message: `Model ${dto.model_version} deployed successfully` },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 部署模型失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 评测体系：Router评测
   */
  @Post('evaluation/router')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '评测Router组件' })
  async evaluateRouter(
    @Body() dto: { model_version: string; test_cases?: any[] },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] Router评测: modelVersion=${dto.model_version}`);

    try {
      const result = await this.evalSuite.evaluateRouter(dto.model_version, dto.test_cases);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] Router评测失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 评测体系：Gate评测
   */
  @Post('evaluation/gate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '评测Gate组件' })
  async evaluateGate(
    @Body() dto: { model_version: string; test_cases?: any[] },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] Gate评测: modelVersion=${dto.model_version}`);

    try {
      const result = await this.evalSuite.evaluateGate(dto.model_version, dto.test_cases);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] Gate评测失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 评测体系：Itinerary评测
   */
  @Post('evaluation/itinerary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '评测Itinerary组件' })
  async evaluateItinerary(
    @Body() dto: { model_version: string; test_cases?: any[] },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] Itinerary评测: modelVersion=${dto.model_version}`);

    try {
      const result = await this.evalSuite.evaluateItinerary(dto.model_version, dto.test_cases);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] Itinerary评测失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 评测体系：完整流程评测
   */
  @Post('evaluation/full-pipeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '评测完整流程' })
  async evaluateFullPipeline(
    @Body() dto: { model_version: string; test_cases?: any[] },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 完整流程评测: modelVersion=${dto.model_version}`);

    try {
      const result = await this.evalSuite.evaluateFullPipeline(dto.model_version, dto.test_cases);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 完整流程评测失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * OPE：生成OPE报告
   */
  @Post('evaluation/ope/report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成OPE报告' })
  async generateOPEReport(
    @Body() dto: {
      model_version: string;
      baseline_version?: string;
      trajectory_ids?: string[];
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 生成OPE报告: modelVersion=${dto.model_version}`);

    try {
      // TODO: 从数据库获取trajectories
      // const trajectories = await this.getTrajectories(dto.trajectory_ids);
      // const baselineRewards = await this.getBaselineRewards(dto.baseline_version);
      // const report = await this.opeEvaluator.generateReport(...);

      return {
        success: true,
        data: { message: 'OPE report generation (not fully implemented)' },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 生成OPE报告失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 回放对照：对比两个策略
   */
  @Post('evaluation/replay/compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '回放对照：对比baseline和新策略' })
  async replayCompare(
    @Body() dto: {
      baseline_version: string;
      new_policy_version: string;
      trajectory_ids?: string[];
      request_ids?: string[];
      min_validation_score?: number;
      min_total_reward?: number;
      country_code?: string;
      date_range?: { start: string; end: string };
      limit?: number;
      offset?: number;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(
      `[TrainingController] 回放对照: baseline=${dto.baseline_version}, newPolicy=${dto.new_policy_version}`,
    );

    try {
      // 从数据库获取trajectories
      const trajectories = await this.etlService.extractTrajectories({
        trajectory_ids: dto.trajectory_ids,
        request_ids: dto.request_ids,
        min_validation_score: dto.min_validation_score,
        min_total_reward: dto.min_total_reward,
        country_code: dto.country_code,
        date_range: dto.date_range,
        limit: dto.limit || 1000,
        offset: dto.offset || 0,
      });

      if (trajectories.length === 0) {
        return {
          success: false,
          data: { error: 'No trajectories found matching the criteria' },
        };
      }

      // 执行回放对照
      const result = await this.replayComparator.compareResults(
        dto.baseline_version,
        dto.new_policy_version,
        trajectories,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 回放对照失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 回归门槛：检查回归门槛
   */
  @Post('evaluation/regression-gate/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '检查回归门槛' })
  async checkRegressionGate(
    @Body() dto: {
      new_policy_version: string;
      baseline_version: string;
      comparison_result: any; // ReplayComparisonResult
      config?: any; // RegressionGateConfig
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(
      `[TrainingController] 检查回归门槛: newPolicy=${dto.new_policy_version}, baseline=${dto.baseline_version}`,
    );

    try {
      const result = await this.regressionGate.checkRegression(
        dto.new_policy_version,
        dto.baseline_version,
        dto.comparison_result,
        dto.config,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 检查回归门槛失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 安全合规：检查约束
   */
  @Post('safety/constraints/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '检查规划约束' })
  async checkConstraints(
    @Body() dto: {
      itinerary: any;
      context: {
        country_code?: string;
        season?: string;
        user_preferences?: Record<string, any>;
        model_version?: string;
      };
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 检查约束`);

    try {
      const result = await this.constraintsEngine.checkConstraints(
        dto.itinerary,
        dto.context,
      );

      return {
        success: true,
        data: {
          ...result,
          ...(isConstraintAgentNarrateOnlyMode()
            ? {
                usage: 'narrate_only',
                formal_authority: 'ConstraintEvaluationGateway',
              }
            : {}),
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 检查约束失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 安全合规：分级风险事件
   */
  @Post('safety/risk-events/classify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分级风险事件' })
  async classifyRiskEvent(
    @Body() dto: ClassifyRiskEventDto,
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 分级风险事件: requestId=${dto.request_id}`);

    try {
      const event = await this.riskEventManager.classifyRiskEvent(
        dto.request_id,
        dto.violations,
        dto.category,
        dto.description,
      );

      return {
        success: true,
        data: event,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 分级风险事件失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 安全合规：处置风险事件
   */
  @Post('safety/risk-events/:eventId/handle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '处置风险事件' })
  @ApiParam({ name: 'eventId', description: '风险事件ID' })
  async handleRiskEvent(
    @Param('eventId') eventId: string,
    @Body() dto: {
      action: 'APPROVE' | 'REJECT' | 'MITIGATE';
      resolved_by: string;
      mitigation_details?: string;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 处置风险事件: eventId=${eventId}`);

    try {
      const event = await this.riskEventManager.handleRiskEvent(
        eventId,
        dto.action,
        dto.resolved_by,
        dto.mitigation_details,
      );

      return {
        success: true,
        data: event,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 处置风险事件失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 安全合规：记录决策审计
   */
  @Post('safety/compliance/audit/record')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '记录决策审计信息' })
  async recordAudit(
    @Body() dto: {
      request_id: string;
      decision_type: string;
      decision_result: string;
      constraint_check_result: any;
      context: {
        user_input: string;
        planning_request: Record<string, any>;
        model_version: string;
        experiment_id?: string;
      };
      risk_event?: any;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 记录决策审计: requestId=${dto.request_id}`);

    try {
      const record = await this.complianceAudit.recordDecision(
        dto.request_id,
        dto.decision_type,
        dto.decision_result,
        dto.constraint_check_result,
        dto.context,
        dto.risk_event,
      );

      return {
        success: true,
        data: record,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 记录决策审计失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 安全合规：获取合规审计报告列表（GET 版本，供前端列表页使用）
   */
  @Get('safety/compliance/audit/report')
  @ApiOperation({ summary: '获取合规审计报告列表' })
  async getComplianceReportList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('period_start') periodStart?: string,
    @Query('period_end') periodEnd?: string,
  ): Promise<{ success: boolean; data: any }> {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '50', 10);
    
    this.logger.log(
      `[TrainingController] 获取合规审计报告列表: page=${pageNum}, limit=${limitNum}`,
    );

    try {
      // 如果没有指定时间范围，默认获取最近30天
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const start = periodStart || thirtyDaysAgo.toISOString();
      const end = periodEnd || now.toISOString();

      const report = await this.complianceAudit.generateComplianceReport(start, end);

      return {
        success: true,
        data: {
          items: report ? [report] : [],
          total: report ? 1 : 0,
          page: pageNum,
          limit: limitNum,
          period: { start, end },
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取合规审计报告列表失败: ${error?.message}`,
        error?.stack,
      );
      // 返回空列表而不是抛出错误
      return {
        success: true,
        data: {
          items: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
        },
      };
    }
  }

  /**
   * 安全合规：生成合规审计报告（POST 版本，用于生成新报告）
   */
  @Post('safety/compliance/audit/report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成合规审计报告' })
  async generateComplianceReport(
    @Body() dto: {
      period_start: string;
      period_end: string;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(
      `[TrainingController] 生成合规审计报告: periodStart=${dto.period_start}, periodEnd=${dto.period_end}`,
    );

    try {
      const report = await this.complianceAudit.generateComplianceReport(
        dto.period_start,
        dto.period_end,
      );

      return {
        success: true,
        data: report,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 生成合规审计报告失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 安全合规：运行红队测试
   */
  @Post('safety/red-team/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '运行安全红队测试' })
  async runRedTeamTests(
    @Body() dto: {
      test_case_ids?: string[];
    },
  ): Promise<{ success: boolean; data: any[] }> {
    this.logger.log(`[TrainingController] 运行红队测试`);

    try {
      const results = await this.securityRedTeam.runRedTeamTests(dto.test_case_ids);

      return {
        success: true,
        data: results,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 运行红队测试失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 安全合规：列出红队测试用例
   */
  @Get('safety/red-team/test-cases')
  @ApiOperation({ summary: '列出安全红队测试用例' })
  async listRedTeamTestCases(
    @Body() dto: ListRedTeamTestCasesDto = {},
  ): Promise<{ success: boolean; data: any[] }> {
    try {
      const testCases = this.securityRedTeam.listTestCases(
        dto.category as any,
      );

      return {
        success: true,
        data: testCases,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 列出红队测试用例失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 产品化：计算Reward
   */
  @Post('product/reward/calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '计算Reward' })
  async calculateReward(
    @Body() dto: {
      metrics: {
        success_rate: number;
        satisfaction: number;
        cost: number;
        compliance_rate: number;
      };
      weights?: any;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 计算Reward`);

    try {
      const config = dto.weights
        ? this.rewardDefinition.updateWeights(dto.weights)
        : this.rewardDefinition.getDefaultConfig();

      const result = this.rewardDefinition.calculateReward(dto.metrics, config);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 计算Reward失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 产品化：追踪用户行为
   */
  @Post('product/feedback/track-action')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '追踪用户行为' })
  async trackUserAction(
    @Body() dto: TrackUserActionDto,
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 追踪用户行为: actionType=${dto.action_type}`);

    try {
      const action = await this.userFeedbackLoop.trackUserAction(
        dto.user_id,
        dto.action_type,
        dto.context,
      );

      return {
        success: true,
        data: action,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 追踪用户行为失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 产品化：收集用户反馈
   */
  @Post('product/feedback/collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '收集用户反馈' })
  async collectFeedback(
    @Body() dto: {
      user_id?: string;
      request_id: string;
      plan_id?: string;
      feedback: {
        satisfaction?: number;
        comments?: string;
        issues?: string[];
      };
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 收集用户反馈: requestId=${dto.request_id}`);

    try {
      const feedback = await this.userFeedbackLoop.collectFeedback(
        dto.user_id,
        dto.request_id,
        dto.plan_id,
        dto.feedback,
      );

      return {
        success: true,
        data: feedback,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 收集用户反馈失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 产品化：分析用户反馈
   */
  @Post('product/feedback/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分析用户反馈' })
  async analyzeFeedback(
    @Body() dto: {
      start_date: string;
      end_date: string;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(
      `[TrainingController] 分析用户反馈: startDate=${dto.start_date}, endDate=${dto.end_date}`,
    );

    try {
      const analysis = await this.userFeedbackLoop.analyzeFeedback(
        dto.start_date,
        dto.end_date,
      );

      return {
        success: true,
        data: analysis,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 分析用户反馈失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 产品化：创建A/B实验
   */
  @Post('product/ab-test/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建A/B实验' })
  async createABTest(
    @Body() dto: {
      name: string;
      description: string;
      variants: Array<{
        name: string;
        model_version: string;
        traffic_percentage: number;
      }>;
      success_metrics: string[];
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 创建A/B实验: name=${dto.name}`);

    try {
      const experiment = await this.abTestManager.createExperiment(
        dto.name,
        dto.description,
        dto.variants,
        dto.success_metrics,
      );

      return {
        success: true,
        data: experiment,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 创建A/B实验失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 产品化：分配用户到实验组
   */
  @Post('product/ab-test/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分配用户到实验组' })
  async assignToGroup(
    @Body() dto: {
      experiment_id: string;
      request_id: string;
      user_id?: string;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(
      `[TrainingController] 分配用户到实验组: experimentId=${dto.experiment_id}`,
    );

    try {
      const assignment = await this.abTestManager.assignToGroup(
        dto.experiment_id,
        dto.request_id,
        dto.user_id,
      );

      return {
        success: true,
        data: assignment,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 分配用户到实验组失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 产品化：分析A/B实验结果
   */
  @Post('product/ab-test/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分析A/B实验结果' })
  async analyzeABTestResults(
    @Body() dto: {
      experiment_id: string;
      variant_metrics: Array<{
        variant_id: string;
        sample_size: number;
        success_count: number;
        total_reward: number;
        total_latency_ms: number;
        error_count: number;
      }>;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(
      `[TrainingController] 分析A/B实验结果: experimentId=${dto.experiment_id}`,
    );

    try {
      const result = await this.abTestManager.analyzeResults(
        dto.experiment_id,
        dto.variant_metrics,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 分析A/B实验结果失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 产品化：生成可解释输出
   */
  @Post('product/explainable/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成可解释输出' })
  async generateExplainableOutput(
    @Body() dto: {
      decision_log: any[];
      evidence_refs: any[];
      model_version: string;
      trace_id: string;
      unified?: import('../../trips/decision/explainability/unified-explainability.types').UnifiedExplainabilityEnvelopeV1;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 生成可解释输出: traceId=${dto.trace_id}`);

    try {
      const explanation = await this.explainableOutput.generateExplanation(
        dto.decision_log,
        dto.evidence_refs,
        dto.model_version,
        dto.trace_id,
        dto.unified ? { unifiedEnvelope: dto.unified } : undefined,
      );

      // 生成用户友好的解释文本
      const userFriendlyText =
        this.explainableOutput.generateUserFriendlyExplanation(explanation);

      return {
        success: true,
        data: {
          ...explanation,
          user_friendly_text: userFriendlyText,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 生成可解释输出失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 增强能力：获取追问话术
   */
  @Get('enhancement/clarification-prompt')
  @ApiOperation({ summary: '获取追问话术模板' })
  async getClarificationPrompt(
    @Query() query: GetClarificationPromptDto,
  ): Promise<{ success: boolean; data: any }> {
    try {
      const effectiveScenario = query.scenario || 'general';
      const effectiveMissingField = query.missing_field || 'travel_dates';
      
      const prompt = this.clarificationPromptDesigner.getPrompt(
        effectiveScenario,
        effectiveMissingField,
        query.language || 'en',
      );

      if (!prompt) {
        // 返回默认模板
        return {
          success: true,
          data: {
            scenario: effectiveScenario,
            missing_field: effectiveMissingField,
            prompt: `Could you please provide more information about your ${effectiveMissingField.replace('_', ' ')}?`,
            questions: [
              {
                field: effectiveMissingField,
                question: `What is your ${effectiveMissingField.replace('_', ' ')}?`,
                type: 'text',
              },
            ],
          },
        };
      }

      return {
        success: true,
        data: prompt,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取追问话术失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 增强能力：获取风险提示
   */
  @Get('enhancement/risk-prompt')
  @ApiOperation({ summary: '获取风险提示模板' })
  async getRiskPrompt(
    @Query() query: GetRiskPromptDto,
  ): Promise<{ success: boolean; data: any }> {
    try {
      const effectiveSevLevel = query.sev_level || 'SEV-2';
      const effectiveCategory = query.category || 'SAFETY';
      const effectiveReason = query.reason || 'general_risk';
      
      const prompt = this.riskPromptDesigner.getPrompt(
        effectiveSevLevel,
        effectiveCategory,
        effectiveReason,
        query.language || 'en',
      );

      if (!prompt) {
        // 返回默认风险提示
        return {
          success: true,
          data: {
            sev_level: effectiveSevLevel,
            category: effectiveCategory,
            title: `⚠️ ${effectiveCategory} Warning`,
            message: `A ${effectiveSevLevel} ${effectiveCategory.toLowerCase()} risk has been detected: ${effectiveReason}`,
            suggestions: [
              'Please review the risk carefully before proceeding',
              'Consider alternative options if available',
            ],
            action_required: effectiveSevLevel === 'SEV-1',
          },
        };
      }

      return {
        success: true,
        data: prompt,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取风险提示失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 增强能力：质量评分
   */
  @Post('enhancement/quality/score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '质量评分（LLM Judge + RM）' })
  async scoreQuality(
    @Body() dto: {
      plan: any;
      user_request: string;
      evidence: any[];
      decision_log: any[];
      use_rm?: boolean;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 质量评分`);

    try {
      const result = await this.qualityScorer.score(
        dto.plan,
        dto.user_request,
        dto.evidence,
        dto.decision_log,
        dto.use_rm || false,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 质量评分失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 增强能力：训练Reward Model
   */
  @Post('enhancement/rm/train')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '训练Reward Model' })
  async trainRewardModel(
    @Body() dto: {
      training_type: 'PREFERENCE_COMPARISON' | 'SCORE_REGRESSION';
      data: any[];
      config?: any;
    },
  ): Promise<{ success: boolean; data: any }> {
    this.logger.log(`[TrainingController] 训练Reward Model: type=${dto.training_type}`);

    try {
      let result;
      if (dto.training_type === 'PREFERENCE_COMPARISON') {
        result = await this.rewardModelTrainer.trainWithPreferenceComparison(
          dto.data,
          dto.config,
        );
      } else {
        result = await this.rewardModelTrainer.trainWithScoreRegression(
          dto.data,
          dto.config,
        );
      }

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 训练Reward Model失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 增强能力：获取红线规则
   */
  @Get('enhancement/domain-expert/red-line-rules')
  @ApiOperation({ summary: '获取红线规则' })
  async getRedLineRules(
    @Body() dto: GetRedLineRulesDto = {},
  ): Promise<{ success: boolean; data: any[] }> {
    try {
      const rules = this.domainExpertKnowledge.getRedLineRules(dto.destination);

      return {
        success: true,
        data: rules,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取红线规则失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 增强能力：获取季节性风险
   */
  @Get('enhancement/domain-expert/seasonal-risks')
  @ApiOperation({ summary: '获取季节性风险' })
  async getSeasonalRisks(
    @Body() dto: {
      destination?: string;
      month?: number;
    } = {},
  ): Promise<{ success: boolean; data: any[] }> {
    try {
      const risks = this.domainExpertKnowledge.getSeasonalRisks(
        dto.destination,
        dto.month,
      );

      return {
        success: true,
        data: risks,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取季节性风险失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 获取baseline rewards（私有辅助方法）
   */
  private async getBaselineRewards(
    baselineVersion: string | undefined,
    trajectories: RLTrajectory[],
  ): Promise<Map<string, number>> {
    const baselineRewards = new Map<string, number>();

    if (!baselineVersion) {
      // 如果没有指定baseline版本，使用当前轨迹的reward
      for (const trajectory of trajectories) {
        baselineRewards.set(
          trajectory.trajectory_id,
          trajectory.metadata.total_reward || 0,
        );
      }
      return baselineRewards;
    }

    // 如果有baseline版本，从数据库查询baseline轨迹的rewards
    try {
      const baselineTrajectories = await this.etlService.extractTrajectories({
        model_version: baselineVersion,
        trajectory_ids: trajectories.map((t) => t.trajectory_id),
        limit: trajectories.length,
      });

      for (const trajectory of baselineTrajectories) {
        baselineRewards.set(
          trajectory.trajectory_id,
          trajectory.metadata.total_reward || 0,
        );
      }

      // 对于没有找到baseline的轨迹，使用当前reward
      for (const trajectory of trajectories) {
        if (!baselineRewards.has(trajectory.trajectory_id)) {
          baselineRewards.set(
            trajectory.trajectory_id,
            trajectory.metadata.total_reward || 0,
          );
        }
      }
    } catch (error: any) {
      this.logger.warn(
        `[TrainingController] 获取baseline rewards失败，使用当前rewards: ${error?.message}`,
      );
      // 如果查询失败，使用当前轨迹的reward
      for (const trajectory of trajectories) {
        baselineRewards.set(
          trajectory.trajectory_id,
          trajectory.metadata.total_reward || 0,
        );
      }
    }

    return baselineRewards;
  }

  /**
   * ROLL 监控：获取 ROLL 架构指标
   */
  @Get('roll/metrics')
  @ApiOperation({ summary: '获取 ROLL 架构监控指标' })
  @ApiResponse({ status: 200, description: 'ROLL 监控指标' })
  async getRollMetrics(): Promise<any> {
    if (!this.rollMonitoring) {
      return {
        success: false,
        error: 'ROLL 监控未启用',
      };
    }

    try {
      const metrics = await this.rollMonitoring.getMetrics();
      return { success: true, data: metrics };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取 ROLL 指标失败: ${error?.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ROLL 监控：获取 Workers 状态
   */
  @Get('roll/workers/status')
  @ApiOperation({ summary: '获取 ROLL Workers 状态' })
  @ApiResponse({ status: 200, description: 'Workers 状态' })
  async getRollWorkersStatus(): Promise<any> {
    if (!this.rollMonitoring) {
      return {
        success: false,
        error: 'ROLL 监控未启用',
      };
    }

    try {
      const status = await this.rollMonitoring.getWorkersStatus();
      return { success: true, data: status };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取 ROLL Workers 状态失败: ${error?.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ROLL 监控：健康检查
   */
  @Get('roll/health')
  @ApiOperation({ summary: 'ROLL 架构健康检查' })
  @ApiResponse({ status: 200, description: '健康状态' })
  async getRollHealth(): Promise<any> {
    if (!this.rollMonitoring) {
      return {
        success: false,
        status: 'unhealthy',
        error: 'ROLL 监控未启用',
      };
    }

    try {
      const health = await this.rollMonitoring.checkHealth();
      return {
        success: health.status === 'healthy',
        status: health.status,
        details: health.details,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] ROLL 健康检查失败: ${error?.message}`,
      );
      return {
        success: false,
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  // ==================== ROLL A/B 测试接口 ====================

  /**
   * ROLL A/B 测试：创建实验
   */
  @Post('roll/ab-test/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '创建 ROLL A/B 测试实验',
    description: '创建一个新的 A/B 测试实验，用于对比 ROLL Workers 和基线实现的性能',
  })
  @ApiResponse({ 
    status: 200, 
    description: '实验创建成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        experimentId: { type: 'string', example: 'exp_roll_001' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'ROLL A/B 测试未启用或参数无效' })
  async createRollABTestExperiment(
    @Body() dto: {
      name: string;
      description: string;
      variants: Array<{
        variant_id: string;
        name: string;
        roll_enabled: boolean;
        roll_config?: {
          use_policy_worker?: boolean;
          use_reward_worker?: boolean;
          use_trajectory_worker?: boolean;
          worker_config?: Record<string, any>;
        };
        traffic_percentage: number;
      }>;
      success_metrics: string[];
    },
  ): Promise<{ success: boolean; experimentId?: string; error?: string }> {
    if (!this.rollABTest) {
      return {
        success: false,
        error: 'ROLL A/B 测试未启用',
      };
    }

    try {
      const result = await this.rollABTest.createRollExperiment(
        dto.name,
        dto.description,
        dto.variants,
        dto.success_metrics,
      );
      return result;
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 创建 ROLL A/B 测试实验失败: ${error?.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ROLL A/B 测试：分析实验结果
   */
  @Post('roll/ab-test/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '分析 ROLL A/B 测试结果',
    description: '分析指定实验的 ROLL vs 基线性能对比结果，需要提供各变体的指标数据',
  })
  @ApiResponse({ 
    status: 200, 
    description: '分析成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            experimentId: { type: 'string' },
            rollVsBaseline: {
              type: 'object',
              properties: {
                roll_variant: { type: 'object' },
                baseline_variant: { type: 'object' },
                improvement: {
                  type: 'object',
                  properties: {
                    success_rate: { type: 'number', example: 0.05 },
                    avg_reward: { type: 'number', example: 0.12 },
                    avg_latency: { type: 'number', example: 50 },
                  },
                },
              },
            },
            recommendation: { type: 'string', example: 'ROLL 变体表现更好，建议逐步扩大流量' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'ROLL A/B 测试未启用或参数无效' })
  async analyzeRollABTestResults(
    @Body() dto: {
      experiment_id: string;
      variant_metrics: Array<{
        variant_id: string;
        sample_size: number;
        success_count: number;
        total_reward: number;
        total_latency_ms: number;
        error_count: number;
        roll_enabled?: boolean;
      }>;
    },
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.rollABTest) {
      return {
        success: false,
        error: 'ROLL A/B 测试未启用',
      };
    }

    try {
      const result = await this.rollABTest.analyzeRollResults(
        dto.experiment_id,
        dto.variant_metrics,
      );
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 分析 ROLL A/B 测试结果失败: ${error?.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ROLL A/B 测试：检查用户是否应使用 ROLL
   */
  @Get('roll/ab-test/should-use')
  @ApiOperation({ summary: '检查是否应该使用 ROLL' })
  async shouldUseRoll(
    @Query('experimentId') experimentId: string,
    @Query('requestId') requestId: string,
    @Query('userId') userId?: string,
  ): Promise<{ success: boolean; data: { shouldUse: boolean; reason: string } }> {
    if (!this.rollABTest) {
      return {
        success: true,
        data: { shouldUse: false, reason: 'ROLL AB Test service not available' },
      };
    }

    try {
      const result = await this.rollABTest.shouldUseRoll(experimentId, requestId, userId);
      return {
        success: true,
        data: { shouldUse: result.useRoll, reason: result.useRoll ? 'Assigned to ROLL variant' : 'Assigned to control' },
      };
    } catch (error: any) {
      this.logger.error(`[TrainingController] 检查 ROLL 使用失败: ${error?.message}`);
      return {
        success: false,
        data: { shouldUse: false, reason: error?.message || 'Unknown error' },
      };
    }
  }

  // ==================== 迭代部署工作流 ====================

  /**
   * 执行迭代部署工作流
   */
  @Post('workflows/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '执行迭代部署工作流' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        minScore: { type: 'number', description: '最小验证分数', default: 0.8 },
        minReward: { type: 'number', description: '最小 reward', default: 0 },
        batchSize: { type: 'number', description: '批次大小', default: 1000 },
        modelConfig: { type: 'object', description: '模型配置' },
        trainingConfig: { type: 'object', description: '训练配置' },
        autoDeploy: { type: 'boolean', description: '是否自动部署', default: false },
      },
    },
  })
  async executeWorkflow(
    @Body() dto: {
      minScore?: number;
      minReward?: number;
      batchSize?: number;
      modelConfig?: any;
      trainingConfig?: any;
      autoDeploy?: boolean;
    },
  ): Promise<{ success: boolean; data: any }> {
    if (!this.iterativeDeploymentWorkflow) {
      return {
        success: false,
        data: { message: 'Iterative deployment workflow service not available' },
      };
    }

    try {
      const result = await this.iterativeDeploymentWorkflow.executeWorkflow(dto);
      return {
        success: result.status === 'SUCCESS',
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[TrainingController] 执行工作流失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * 获取工作流状态
   */
  @Get('workflows/:workflowId')
  @ApiOperation({ summary: '获取工作流状态' })
  @ApiParam({ name: 'workflowId', description: '工作流 ID' })
  async getWorkflowStatus(
    @Param('workflowId') workflowId: string,
  ): Promise<{ success: boolean; data: any }> {
    if (!this.iterativeDeploymentWorkflow) {
      return {
        success: false,
        data: { message: 'Iterative deployment workflow service not available' },
      };
    }

    try {
      const status = await this.iterativeDeploymentWorkflow.getWorkflowStatus(workflowId);
      return {
        success: true,
        data: status,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 获取工作流状态失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  // ==================== 模型版本 A/B 测试 ====================

  /**
   * 创建模型版本对比实验
   */
  @Post('models/ab-test/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建模型版本对比实验' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '实验名称' },
        description: { type: 'string', description: '实验描述' },
        controlVersion: { type: 'string', description: '对照组版本' },
        treatmentVersion: { type: 'string', description: '实验组版本' },
        trafficSplit: {
          type: 'object',
          properties: {
            control: { type: 'number', description: '对照组流量百分比' },
            treatment: { type: 'number', description: '实验组流量百分比' },
          },
        },
        successMetrics: {
          type: 'array',
          items: { type: 'string' },
          description: '成功指标',
        },
        minSampleSize: { type: 'number', description: '最小样本量' },
        durationDays: { type: 'number', description: '实验持续时间（天）' },
      },
      required: ['name', 'description', 'controlVersion', 'treatmentVersion', 'successMetrics'],
    },
  })
  async createModelVersionExperiment(
    @Body() dto: {
      name: string;
      description: string;
      controlVersion: string;
      treatmentVersion: string;
      trafficSplit?: { control: number; treatment: number };
      successMetrics: string[];
      minSampleSize?: number;
      durationDays?: number;
    },
  ): Promise<{ success: boolean; data: any }> {
    if (!this.modelABTest) {
      return {
        success: false,
        data: { message: 'Model AB Test service not available' },
      };
    }

    try {
      const result = await this.modelABTest.createModelVersionExperiment(dto);
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 创建模型版本实验失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 分析模型版本对比结果
   */
  @Post('models/ab-test/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分析模型版本对比结果' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        experimentId: { type: 'string', description: '实验 ID' },
        controlVersion: { type: 'string', description: '对照组版本' },
        treatmentVersion: { type: 'string', description: '实验组版本' },
      },
      required: ['experimentId', 'controlVersion', 'treatmentVersion'],
    },
  })
  async analyzeModelVersionComparison(
    @Body() dto: {
      experimentId: string;
      controlVersion: string;
      treatmentVersion: string;
    },
  ): Promise<{ success: boolean; data: any }> {
    if (!this.modelABTest) {
      return {
        success: false,
        data: { message: 'Model AB Test service not available' },
      };
    }

    try {
      const result = await this.modelABTest.analyzeModelVersionComparison(
        dto.experimentId,
        dto.controlVersion,
        dto.treatmentVersion,
      );
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 分析模型版本对比失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 推广模型版本
   */
  @Post('models/ab-test/promote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '推广模型版本（如果 A/B 测试通过）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        experimentId: { type: 'string', description: '实验 ID' },
        treatmentVersion: { type: 'string', description: '要推广的版本' },
      },
      required: ['experimentId', 'treatmentVersion'],
    },
  })
  async promoteModelVersion(
    @Body() dto: {
      experimentId: string;
      treatmentVersion: string;
    },
  ): Promise<{ success: boolean; data: any }> {
    if (!this.modelABTest) {
      return {
        success: false,
        data: { message: 'Model AB Test service not available' },
      };
    }

    try {
      await this.modelABTest.promoteModelVersion(dto.experimentId, dto.treatmentVersion);
      return {
        success: true,
        data: {
          message: '模型版本已推广',
          productionVersion: dto.treatmentVersion,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 推广模型版本失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
  @ApiOperation({ 
    summary: '检查是否应使用 ROLL Workers',
    description: '根据实验分配判断指定请求/用户是否应该使用 ROLL Workers',
  })
  @ApiResponse({ 
    status: 200, 
    description: '检查结果',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        use_roll: { type: 'boolean', example: true },
        variant_id: { type: 'string', example: 'variant_roll_1' },
        roll_config: { 
          type: 'object',
          properties: {
            use_policy_worker: { type: 'boolean' },
            use_reward_worker: { type: 'boolean' },
            use_trajectory_worker: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'ROLL A/B 测试未启用' })
  async checkShouldUseRoll(
    @Query('experiment_id') experimentId: string,
    @Query('request_id') requestId: string,
    @Query('user_id') userId?: string,
  ): Promise<{ success: boolean; use_roll?: boolean; variant_id?: string; roll_config?: any; error?: string }> {
    if (!this.rollABTest) {
      return {
        success: false,
        error: 'ROLL A/B 测试未启用',
      };
    }

    try {
      const result = await this.rollABTest.shouldUseRoll(
        experimentId,
        requestId,
        userId,
      );
      return {
        success: true,
        use_roll: result.useRoll,
        variant_id: result.variantId,
        roll_config: result.rollConfig,
      };
    } catch (error: any) {
      this.logger.error(
        `[TrainingController] 检查 ROLL 使用状态失败: ${error?.message}`,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
