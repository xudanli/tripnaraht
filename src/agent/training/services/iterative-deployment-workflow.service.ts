// src/agent/training/services/iterative-deployment-workflow.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { TrajectoryCollectionService } from './trajectory-collection.service';
import { TrajectoryValidatorService } from './trajectory-validator.service';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { TrainingDataPreparationService } from './training-data-preparation.service';
import { TrainingPipelineService } from './training-pipeline.service';
import { ModelRegistryService } from './model-registry.service';
import { ModelDeploymentService } from './model-deployment.service';
import { EvalSuiteService } from './eval-suite.service';
import { RegressionGateService } from './regression-gate.service';
import { ReplayComparatorService } from './replay-comparator.service';
import { TrajectoryETLService } from './trajectory-etl.service';
import { ShadowDeploymentWorkflowService } from './shadow-deployment-workflow.service';
import type { SftThenDpoPipelineStatus } from '../interfaces/fine-tune-pipeline.types';

/**
 * IterativeDeploymentWorkflowService
 * 
 * 职责：管理端到端迭代部署工作流
 * 
 * 工作流步骤：
 * 1. 轨迹收集（TrajectoryCollectionService）
 * 2. 轨迹验证（TrajectoryValidatorService）
 * 3. Reward 提取（RewardSignalExtractorService）
 * 4. 训练数据准备（TrainingDataPreparationService）
 * 5. 模型微调（TrainingPipelineService）
 * 6. 模型注册（ModelRegistryService）
 * 7. 模型评估（EvalSuiteService）
 * 8. 回归门控（RegressionGateService）
 * 9. 模型部署（如果通过评估）
 */
@Injectable()
export class IterativeDeploymentWorkflowService {
  private readonly logger = new Logger(IterativeDeploymentWorkflowService.name);

  constructor(
    private readonly trajectoryCollection: TrajectoryCollectionService,
    private readonly trajectoryValidator: TrajectoryValidatorService,
    private readonly rewardExtractor: RewardSignalExtractorService,
    private readonly dataPrep: TrainingDataPreparationService,
    private readonly trainingPipeline: TrainingPipelineService,
    private readonly modelRegistry: ModelRegistryService,
    private readonly modelDeployment: ModelDeploymentService,
    private readonly evalSuite: EvalSuiteService,
    private readonly regressionGate: RegressionGateService,
    private readonly replayComparator: ReplayComparatorService,
    private readonly trajectoryETL: TrajectoryETLService,
    @Optional() private readonly shadowDeployment?: ShadowDeploymentWorkflowService,
  ) {}

  /**
   * 飞轮 pipeline 完成 → 阴影注册（委托 ShadowDeploymentWorkflowService）。
   */
  async registerShadowAdapterFromPipeline(
    pipeline: SftThenDpoPipelineStatus,
  ): Promise<{ shadowVersion?: string; registered: boolean; reason?: string }> {
    if (!this.shadowDeployment) {
      return { registered: false, reason: 'shadow_deployment_workflow_unavailable' };
    }
    return this.shadowDeployment.onFlywheelPipelineCompleted(pipeline);
  }

  /**
   * 阴影评测达标后晋升生产 Planner。
   */
  async promoteShadowPlanner(shadowVersion: string, force = false) {
    if (!this.shadowDeployment) {
      return { shadowVersion, promoted: false, reason: 'shadow_deployment_workflow_unavailable' };
    }
    return this.shadowDeployment.promote(shadowVersion, { force });
  }

  /**
   * 执行完整的迭代部署工作流
   */
  async executeWorkflow(options: {
    minScore?: number;
    minReward?: number;
    batchSize?: number;
    modelConfig?: any;
    trainingConfig?: any;
    autoDeploy?: boolean; // 是否自动部署（如果通过评估）
  }): Promise<{
    workflowId: string;
    status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
    steps: Array<{
      step: string;
      status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
      result?: any;
      error?: string;
    }>;
    modelVersion?: string;
  }> {
    const workflowId = `workflow_${Date.now()}`;
    const steps: Array<{
      step: string;
      status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
      result?: any;
      error?: string;
    }> = [];

    this.logger.log(`[IterativeDeployment] 开始执行工作流: workflowId=${workflowId}`);

    try {
      // 步骤 1: 准备训练数据
      this.logger.log(`[IterativeDeployment] 步骤 1: 准备训练数据`);
      const trainingBatch = await this.dataPrep.prepareTrainingBatch({
        minScore: options.minScore || 0.8,
        minReward: options.minReward || 0,
        batchSize: options.batchSize || 1000,
      });

      if (trainingBatch.trajectories.length === 0) {
        this.logger.warn(`[IterativeDeployment] 没有符合条件的训练数据，工作流终止`);
        steps.push({
          step: 'prepare_training_data',
          status: 'SKIPPED',
          result: { reason: 'No qualified trajectories' },
        });
        return {
          workflowId,
          status: 'BLOCKED',
          steps,
        };
      }

      steps.push({
        step: 'prepare_training_data',
        status: 'SUCCESS',
        result: {
          batchId: trainingBatch.batchId,
          trajectoryCount: trainingBatch.trajectories.length,
          stats: trainingBatch.stats,
        },
      });

      // 步骤 2: 创建训练任务
      this.logger.log(`[IterativeDeployment] 步骤 2: 创建训练任务`);
      const trainingJob = await this.trainingPipeline.createTrainingJob(
        trainingBatch.batchId,
        options.modelConfig || {
          model_type: 'claude-3-5-sonnet',
          provider: 'anthropic',
        },
        options.trainingConfig || {
          learning_rate: 0.0001,
          num_epochs: 3,
          batch_size: 32,
        },
      );

      steps.push({
        step: 'create_training_job',
        status: 'SUCCESS',
        result: { jobId: trainingJob.job_id },
      });

      // 步骤 3: 启动训练
      this.logger.log(`[IterativeDeployment] 步骤 3: 启动训练`);
      const startedJob = await this.trainingPipeline.startTraining(trainingJob.job_id);

      steps.push({
        step: 'start_training',
        status: 'SUCCESS',
        result: {
          jobId: startedJob.job_id,
          rayJobId: startedJob.ray_job_id,
          mlflowRunId: startedJob.mlflow_run_id,
        },
      });

      // 步骤 4: 等待训练完成（轮询状态）
      this.logger.log(`[IterativeDeployment] 步骤 4: 等待训练完成`);
      let completedJob = startedJob;
      let attempts = 0;
      const maxAttempts = 120; // 最多等待 10 分钟（每 5 秒检查一次）

      while (completedJob.status === 'RUNNING' && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // 等待 5 秒
        completedJob = await this.trainingPipeline.getTrainingJobStatus(completedJob.job_id);
        attempts++;
      }

      if (completedJob.status !== 'COMPLETED') {
        this.logger.error(
          `[IterativeDeployment] 训练未完成: status=${completedJob.status}, jobId=${completedJob.job_id}`,
        );
        steps.push({
          step: 'wait_training_complete',
          status: 'FAILED',
          error: `Training status: ${completedJob.status}`,
        });
        return {
          workflowId,
          status: 'FAILED',
          steps,
        };
      }

      steps.push({
        step: 'wait_training_complete',
        status: 'SUCCESS',
        result: {
          modelVersion: completedJob.model_version?.version,
          trainingMetrics: completedJob.model_version?.training_metrics,
        },
      });

      if (!completedJob.model_version) {
        this.logger.error(`[IterativeDeployment] 训练完成但未生成模型版本`);
        return {
          workflowId,
          status: 'FAILED',
          steps,
        };
      }

      const modelVersion = completedJob.model_version;

      // 步骤 5: 注册模型
      this.logger.log(`[IterativeDeployment] 步骤 5: 注册模型`);
      const registryEntry = await this.modelRegistry.registerModel(modelVersion);

      steps.push({
        step: 'register_model',
        status: 'SUCCESS',
        result: {
          version: registryEntry.version,
          mlflowModelUri: registryEntry.mlflow_model_uri,
        },
      });

      // 步骤 6: 评估模型
      this.logger.log(`[IterativeDeployment] 步骤 6: 评估模型`);
      const evalResults = await this.evalSuite.evaluateFullPipeline(modelVersion.version);

      steps.push({
        step: 'evaluate_model',
        status: 'SUCCESS',
        result: evalResults,
      });

      // 步骤 7: 回归门控检查
      // 需要获取 baseline 版本进行对比
      const baselineVersion = this.modelRegistry.getCurrentProductionVersion() || 'v1.0.0';
      
      // 获取用于对比的完整轨迹数据（最多100条）
      const trajectoryIds = trainingBatch.trajectories
        .slice(0, Math.min(100, trainingBatch.trajectories.length))
        .map((t) => t.trajectoryId);
      
      const comparisonTrajectories = await this.trajectoryETL.extractTrajectories({
        trajectory_ids: trajectoryIds,
        limit: 100,
      });
      
      // 执行回放对比
      const comparisonResult = await this.replayComparator.compareResults(
        baselineVersion,
        modelVersion.version,
        comparisonTrajectories,
      );

      this.logger.log(`[IterativeDeployment] 步骤 7: 回归门控检查`);
      const gateResult = await this.regressionGate.checkRegression(
        modelVersion.version,
        baselineVersion,
        comparisonResult,
      );

      if (!gateResult.passed) {
        this.logger.warn(
          `[IterativeDeployment] 回归门控未通过: ${gateResult.recommendation.reasoning}`,
        );
        steps.push({
          step: 'regression_gate',
          status: 'FAILED',
          result: gateResult,
        });
        return {
          workflowId,
          status: 'BLOCKED',
          steps,
          modelVersion: modelVersion.version,
        };
      }

      steps.push({
        step: 'regression_gate',
        status: 'SUCCESS',
        result: gateResult,
      });

      // 步骤 8: 部署模型（如果启用自动部署）
      if (options.autoDeploy) {
        this.logger.log(`[IterativeDeployment] 步骤 8: 部署模型`);
        const deployResult = await this.modelDeployment.deployVersion(modelVersion.version);

        steps.push({
          step: 'deploy_model',
          status: deployResult.success ? 'SUCCESS' : 'FAILED',
          result: {
            productionVersion: modelVersion.version,
            deployedAt: deployResult.deployedAt,
            success: deployResult.success,
          },
          error: deployResult.error,
        });
      } else {
        steps.push({
          step: 'deploy_model',
          status: 'SKIPPED',
          result: { reason: 'autoDeploy is false' },
        });
      }

      // 标记训练数据为已使用
      await this.dataPrep.markAsUsed(
        trainingBatch.trajectories.map((t) => t.trajectoryId),
        trainingBatch.batchId,
      );

      this.logger.log(`[IterativeDeployment] 工作流执行成功: workflowId=${workflowId}`);

      return {
        workflowId,
        status: 'SUCCESS',
        steps,
        modelVersion: modelVersion.version,
      };
    } catch (error: any) {
      this.logger.error(
        `[IterativeDeployment] 工作流执行失败: workflowId=${workflowId}, error=${error?.message}`,
        error.stack,
      );

      steps.push({
        step: 'workflow_error',
        status: 'FAILED',
        error: error.message,
      });

      return {
        workflowId,
        status: 'FAILED',
        steps,
      };
    }
  }

  /**
   * 获取工作流状态
   */
  async getWorkflowStatus(workflowId: string): Promise<{
    workflowId: string;
    status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'BLOCKED';
    currentStep?: string;
    steps: Array<{
      step: string;
      status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RUNNING';
    }>;
  }> {
    // TODO: 如果实现了工作流状态存储，从数据库查询
    // 当前实现：返回模拟状态
    this.logger.warn(`[IterativeDeployment] getWorkflowStatus 未实现状态存储`);
    return {
      workflowId,
      status: 'RUNNING',
      steps: [],
    };
  }
}
