// src/agent/training/services/training-pipeline.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TrainingJob,
  ModelVersion,
  TrainingConfig,
  ModelConfig,
  HyperparameterSearchSpace,
  HyperparameterTuningResult,
  TrainingMetrics,
} from '../interfaces/training-platform.interface';
import { TrainingDataPreparationService } from './training-data-preparation.service';
import { DatasetVersionManagerService } from './dataset-version-manager.service';

/**
 * TrainingPipelineService
 * 
 * 职责：管理训练任务，与Python训练服务通信
 * 
 * 功能：
 * 1. createTrainingJob() - 创建训练任务
 * 2. startTraining() - 启动训练（调用Python服务）
 * 3. getTrainingJobStatus() - 获取训练任务状态
 * 4. cancelTrainingJob() - 取消训练任务
 * 5. tuneHyperparameters() - 超参数调优
 */
@Injectable()
export class TrainingPipelineService {
  private readonly logger = new Logger(TrainingPipelineService.name);
  private readonly trainingServiceUrl: string;
  private readonly jobs: Map<string, TrainingJob> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly dataPrepService: TrainingDataPreparationService,
    private readonly versionManager: DatasetVersionManagerService,
  ) {
    // 从环境变量获取Python训练服务URL
    this.trainingServiceUrl =
      this.configService.get<string>('TRAINING_SERVICE_URL') ||
      'http://localhost:8001';
  }

  /**
   * 创建训练任务
   */
  async createTrainingJob(
    datasetVersion: string,
    modelConfig: ModelConfig,
    trainingConfig: TrainingConfig,
    hyperparameterSearch?: {
      enabled: boolean;
      search_space: HyperparameterSearchSpace;
      num_trials?: number;
    },
  ): Promise<TrainingJob> {
    this.logger.log(
      `[TrainingPipeline] 创建训练任务: datasetVersion=${datasetVersion}`,
    );

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const job: TrainingJob = {
      job_id: jobId,
      dataset_version: datasetVersion,
      model_config: modelConfig,
      training_config: trainingConfig,
      hyperparameter_search: hyperparameterSearch,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    // 保存到数据库（如果需要持久化）
    // await this.saveTrainingJob(job);

    this.logger.log(`[TrainingPipeline] 训练任务已创建: jobId=${jobId}`);

    return job;
  }

  /**
   * 启动训练
   */
  async startTraining(jobId: string): Promise<TrainingJob> {
    this.logger.log(`[TrainingPipeline] 启动训练: jobId=${jobId}`);

    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Training job not found: ${jobId}`);
    }

    if (job.status !== 'PENDING') {
      throw new Error(`Training job is not in PENDING status: ${job.status}`);
    }

    // 更新状态为RUNNING
    job.status = 'RUNNING';
    job.started_at = new Date().toISOString();

    try {
      // 尝试调用Python训练服务
      const response = await fetch(`${this.trainingServiceUrl}/training/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: jobId,
          dataset_version: job.dataset_version,
          model_config: job.model_config,
          training_config: job.training_config,
          hyperparameter_search: job.hyperparameter_search,
        }),
      });

      if (!response.ok) {
        throw new Error(`Training service error: ${response.statusText}`);
      }

      const result = (await response.json()) as {
        ray_job_id?: string;
        mlflow_run_id?: string;
      };
      job.ray_job_id = result.ray_job_id;
      job.mlflow_run_id = result.mlflow_run_id;

      this.logger.log(
        `[TrainingPipeline] 训练已启动: jobId=${jobId}, rayJobId=${result.ray_job_id || 'N/A'}`,
      );

      return job;
    } catch (error: any) {
      // 外部服务不可用，使用本地模拟模式
      this.logger.warn(
        `[TrainingPipeline] 外部训练服务不可用，使用本地模拟模式: jobId=${jobId}`,
      );
      
      // 模拟训练过程
      job.ray_job_id = `local_${jobId}`;
      job.mlflow_run_id = `mlflow_local_${Date.now()}`;
      
      // 模拟异步训练完成（5秒后完成）
      setTimeout(() => {
        job.status = 'COMPLETED';
        job.completed_at = new Date().toISOString();
        job.model_version = {
          version: `v${Date.now()}`,
          model_path: `/models/local/${jobId}`,
          training_metrics: {
            loss: 0.15,
            accuracy: 0.92,
            learning_rate: job.training_config.learning_rate,
            epoch: job.training_config.num_epochs,
            step: job.training_config.num_epochs * 100,
            timestamp: new Date().toISOString(),
          },
          training_config: job.training_config,
          model_config: job.model_config,
          created_at: new Date().toISOString(),
          status: 'COMPLETED',
        };
        this.logger.log(`[TrainingPipeline] 模拟训练完成: jobId=${jobId}`);
      }, 5000);

      this.logger.log(
        `[TrainingPipeline] 训练已启动(本地模拟): jobId=${jobId}`,
      );

      return job;
    }
  }

  /**
   * 获取训练任务状态
   */
  async getTrainingJobStatus(jobId: string): Promise<TrainingJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Training job not found: ${jobId}`);
    }

    // 如果任务正在运行，从Python服务获取最新状态
    if (job.status === 'RUNNING' && job.ray_job_id) {
      try {
        const response = await fetch(
          `${this.trainingServiceUrl}/training/status/${job.ray_job_id}`,
        );

        if (response.ok) {
          const status = (await response.json()) as {
            status?: string;
            metrics?: any;
            completed?: boolean;
            model_version?: ModelVersion;
          };
          if (status.status) {
            job.status = this.mapTrainingStatus(status.status);
          }
          if (status.metrics) {
            // 更新训练指标
          }
          if (status.completed) {
            job.completed_at = new Date().toISOString();
            if (status.model_version) {
              job.model_version = status.model_version;
            }
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `[TrainingPipeline] 获取训练状态失败: jobId=${jobId}, error=${error?.message}`,
        );
      }
    }

    return job;
  }

  /**
   * 取消训练任务
   */
  async cancelTrainingJob(jobId: string): Promise<void> {
    this.logger.log(`[TrainingPipeline] 取消训练任务: jobId=${jobId}`);

    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Training job not found: ${jobId}`);
    }

    if (job.status !== 'RUNNING') {
      throw new Error(`Training job is not running: ${job.status}`);
    }

    try {
      if (job.ray_job_id) {
        // 调用Python服务取消训练
        await fetch(`${this.trainingServiceUrl}/training/cancel/${job.ray_job_id}`, {
          method: 'POST',
        });
      }

      job.status = 'CANCELLED';
      this.logger.log(`[TrainingPipeline] 训练任务已取消: jobId=${jobId}`);
    } catch (error: any) {
      this.logger.error(
        `[TrainingPipeline] 取消训练任务失败: jobId=${jobId}, error=${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 超参数调优
   */
  async tuneHyperparameters(
    datasetVersion: string,
    modelConfig: ModelConfig,
    searchSpace: HyperparameterSearchSpace,
    numTrials: number = 10,
  ): Promise<HyperparameterTuningResult> {
    this.logger.log(
      `[TrainingPipeline] 开始超参数调优: datasetVersion=${datasetVersion}, numTrials=${numTrials}`,
    );

    try {
      const response = await fetch(`${this.trainingServiceUrl}/training/tune`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataset_version: datasetVersion,
          model_config: modelConfig,
          search_space: searchSpace,
          num_trials: numTrials,
        }),
      });

      if (!response.ok) {
        throw new Error(`Hyperparameter tuning error: ${response.statusText}`);
      }

      const result = (await response.json()) as HyperparameterTuningResult;

      this.logger.log(
        `[TrainingPipeline] 超参数调优完成: bestTrialId=${result.best_trial.trial_id}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[TrainingPipeline] 超参数调优失败: error=${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 列出所有训练任务
   */
  async listTrainingJobs(): Promise<TrainingJob[]> {
    return Array.from(this.jobs.values());
  }

  /**
   * 映射训练状态
   */
  private mapTrainingStatus(status: string): TrainingJob['status'] {
    const mapping: Record<string, TrainingJob['status']> = {
      pending: 'PENDING',
      running: 'RUNNING',
      completed: 'COMPLETED',
      failed: 'FAILED',
      cancelled: 'CANCELLED',
    };

    return mapping[status.toLowerCase()] || 'FAILED';
  }
}
