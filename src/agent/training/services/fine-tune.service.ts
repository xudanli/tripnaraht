import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionTrajectoryTrainingSyncService } from './decision-trajectory-training-sync.service';
import { ShadowDeploymentWorkflowService } from './shadow-deployment-workflow.service';
import type { DecisionTrajectoryTrainingPackResult } from '../interfaces/decision-trajectory-etl.types';
import type {
  SftThenDpoPipelineRun,
  SftThenDpoPipelineStage,
  SftThenDpoPipelineStatus,
} from '../interfaces/fine-tune-pipeline.types';

/**
 * LoRA 微调训练配置
 */
export interface FineTuneConfig {
  /** 基座模型 */
  model_name: string;
  /** LoRA rank */
  lora_rank: number;
  /** LoRA alpha */
  lora_alpha: number;
  /** 学习率 */
  learning_rate: number;
  /** 训练轮数 */
  num_epochs: number;
  /** 批次大小 */
  batch_size: number;
  /** 数据集名称 */
  dataset_name: string;
  /** sft | dpo | sft_then_dpo */
  training_stage?: 'sft' | 'dpo' | 'sft_then_dpo';
  /** Python 容器内 DPO JSONL（register 后或 mount 路径） */
  dpo_dataset_path?: string;
  /** SFT repair 链 JSONL */
  sft_dataset_path?: string;
  dpo_pair_types?: Array<'planner_obedience' | 'debate_narrator'>;
  dpo_rejected_sources?: Array<'true_topology' | 'violation_surrogate'>;
  /** SFT 阶段 epoch（Chain-of-Repair） */
  sft_num_epochs?: number;
  /** DPO 阶段 epoch */
  dpo_num_epochs?: number;
  sft_learning_rate?: number;
  dpo_learning_rate?: number;
}

/**
 * 训练任务状态
 */
export enum TrainingStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * 训练任务
 */
export interface TrainingTask {
  task_id: string;
  status: TrainingStatus;
  config: FineTuneConfig;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  progress: number;
  current_epoch: number;
  current_step: number;
  total_steps: number;
  loss?: number;
  metrics: Record<string, any>;
  error?: string;
  pipeline_stage?: string;
  checkpoint_sft_final?: string;
  production_adapter_path?: string;
}

/**
 * 训练数据导出格式
 */
export interface TrainingDataItem {
  conversations: Array<{
    from: 'human' | 'gpt';
    value: string;
  }>;
}

/**
 * TripNARA LoRA 微调服务
 * 
 * 职责：
 * 1. 与 Python 训练服务通信
 * 2. 管理训练任务生命周期
 * 3. 准备和导出训练数据
 * 4. 监控训练进度和指标
 */
@Injectable()
export class FineTuneService implements OnModuleInit {
  private readonly logger = new Logger(FineTuneService.name);
  
  /** Python 训练服务地址 */
  private trainServiceUrl: string;

  /** sft_then_dpo 串联任务本地状态（与 Python task 同步） */
  private readonly pipelineRuns = new Map<string, SftThenDpoPipelineRun>();

  private readonly pipelineShadowMonitors = new Set<string>();
  
  /** 默认训练配置 */
  private defaultConfig: FineTuneConfig = {
    model_name: 'Qwen/Qwen2.5-7B-Instruct',
    lora_rank: 64,
    lora_alpha: 128,
    learning_rate: 2e-4,
    num_epochs: 3,
    batch_size: 2,
    dataset_name: 'tripnara_decision',
    training_stage: 'sft',
  };
  
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    @Optional() private readonly decisionTrajectorySync?: DecisionTrajectoryTrainingSyncService,
    @Optional() private readonly shadowDeployment?: ShadowDeploymentWorkflowService,
  ) {
    this.trainServiceUrl = this.configService.get<string>('TRAIN_SERVICE_URL') || 'http://localhost:8000';
  }
  
  async onModuleInit() {
    this.logger.log(`FineTuneService initialized, train service: ${this.trainServiceUrl}`);
    
    // 检查训练服务健康状态
    const healthy = await this.checkTrainServiceHealth();
    if (healthy) {
      this.logger.log('Training service is healthy');
    } else {
      this.logger.warn('Training service is not available');
    }
  }
  
  /**
   * 检查训练服务健康状态
   */
  async checkTrainServiceHealth(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.trainServiceUrl}/health`).pipe(
          timeout(5000),
          catchError(() => {
            throw new Error('Health check timeout');
          }),
        ),
      );
      return (response as AxiosResponse).data?.status === 'healthy';
    } catch (error: any) {
      this.logger.warn(`Training service health check failed: ${error?.message || error}`);
      return false;
    }
  }
  
  /**
   * 获取 GPU 信息
   */
  async getGpuInfo(): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.trainServiceUrl}/gpu/info`).pipe(
          timeout(5000),
        ),
      );
      return (response as AxiosResponse).data;
    } catch (error: any) {
      this.logger.error(`Failed to get GPU info: ${error?.message || error}`);
      return { available: false, error: error?.message || String(error) };
    }
  }
  
  /**
   * 启动训练任务
   */
  async startTraining(
    taskId: string,
    config?: Partial<FineTuneConfig>,
    resumeFromCheckpoint?: string,
  ): Promise<{ task_id: string; status: string; message: string; pipeline_stage?: string }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    this.applyTrainingEnvDefaults(finalConfig);

    const stage =
      finalConfig.training_stage ||
      this.configService.get<string>('TRAINING_STAGE')?.trim() ||
      'sft';

    if (stage === 'sft_then_dpo') {
      finalConfig.training_stage = 'sft_then_dpo';
      return this.startSftThenDpoPipeline(taskId, finalConfig, resumeFromCheckpoint);
    }

    this.logger.log(`Starting training task: ${taskId}`);
    this.logger.log(`Config: ${JSON.stringify(finalConfig)}`);

    const prepared = await this.decisionTrajectorySync?.syncAndPrepareForPythonTraining();
    if (prepared?.pack) {
      const { pack, dataset_paths } = prepared;
      this.logger.log(
        `[FineTune] decision_trajectory pack: ${pack.dpo_jsonl_path} ` +
          `(planner=${pack.stats.dpo_planner_obedience}, true_topology=${pack.stats.dpo_planner_true_topology}, ` +
          `debate=${pack.stats.dpo_debate_narrator}, repair_sft=${pack.stats.sft_repair_chains})`,
      );
      if (dataset_paths?.dpo_dataset_path) {
        finalConfig.dpo_dataset_path =
          this.configService.get<string>('TRAINING_DPO_DATASET_PATH')?.trim() ||
          dataset_paths.dpo_dataset_path;
        if (dataset_paths.sft_dataset_path) {
          finalConfig.sft_dataset_path = dataset_paths.sft_dataset_path;
        }
        if (!finalConfig.training_stage) {
          const envStage = this.configService.get<string>('TRAINING_STAGE')?.trim();
          if (envStage === 'dpo') {
            finalConfig.training_stage = 'dpo';
          }
        }
      }
    }

    const pairTypes = this.configService.get<string>('TRAINING_DPO_PAIR_TYPES');
    if (pairTypes?.trim()) {
      finalConfig.dpo_pair_types = pairTypes.split(',').map((s) => s.trim()) as FineTuneConfig['dpo_pair_types'];
    }
    const rejectedSources = this.configService.get<string>('TRAINING_DPO_REJECTED_SOURCES');
    if (rejectedSources?.trim()) {
      finalConfig.dpo_rejected_sources = rejectedSources.split(',').map((s) => s.trim()) as FineTuneConfig['dpo_rejected_sources'];
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.trainServiceUrl}/training/start`, {
          task_id: taskId,
          config: finalConfig,
          resume_from_checkpoint: resumeFromCheckpoint,
        }).pipe(
          timeout(30000),
        ),
      );
      
      return (response as AxiosResponse).data;
    } catch (error: any) {
      this.logger.error(`Failed to start training: ${error?.message || error}`);
      throw new Error(`Failed to start training: ${error?.message || error}`);
    }
  }
  
  /**
   * sft_then_dpo 两阶段串联：SFT（修复链）→ checkpoint-sft-final → DPO（真拓扑偏好）→ 生产 LoRA。
   */
  async startSftThenDpoPipeline(
    taskId: string,
    config?: Partial<FineTuneConfig>,
    resumeFromCheckpoint?: string,
  ): Promise<{ task_id: string; status: string; message: string; pipeline_stage: string }> {
    const finalConfig: FineTuneConfig = {
      ...this.defaultConfig,
      ...config,
      training_stage: 'sft_then_dpo',
    };
    this.applyTrainingEnvDefaults(finalConfig);

    this.logger.log(`[Pipeline] Starting sft_then_dpo: ${taskId}`);

    const prepared = await this.decisionTrajectorySync?.syncAndPrepareForPythonTraining();
    if (!prepared?.pack) {
      throw new Error(
        'sft_then_dpo requires decision trajectory ETL pack. ' +
          'Enable TRAINING_DECISION_TRAJECTORY_ETL_ENABLED=1',
      );
    }

    this.validateSftThenDpoPack(prepared.pack);

    if (prepared.dataset_paths) {
      finalConfig.sft_dataset_path = prepared.dataset_paths.sft_dataset_path;
      finalConfig.dpo_dataset_path =
        this.configService.get<string>('TRAINING_DPO_DATASET_PATH')?.trim() ||
        prepared.dataset_paths.dpo_dataset_path;
    }

    const pairTypes = this.configService.get<string>('TRAINING_DPO_PAIR_TYPES');
    if (pairTypes?.trim()) {
      finalConfig.dpo_pair_types = pairTypes
        .split(',')
        .map((s) => s.trim()) as FineTuneConfig['dpo_pair_types'];
    }
    const rejectedSources = this.configService.get<string>('TRAINING_DPO_REJECTED_SOURCES');
    if (rejectedSources?.trim()) {
      finalConfig.dpo_rejected_sources = rejectedSources
        .split(',')
        .map((s) => s.trim()) as FineTuneConfig['dpo_rejected_sources'];
    }

    if (!finalConfig.sft_dataset_path) {
      throw new Error('sft_then_dpo: missing SFT repair chain dataset path');
    }
    if (!finalConfig.dpo_dataset_path) {
      throw new Error('sft_then_dpo: missing DPO preferences dataset path');
    }

    const now = new Date().toISOString();
    this.pipelineRuns.set(taskId, {
      task_id: taskId,
      stage: 'pending',
      config: { ...finalConfig },
      created_at: now,
      updated_at: now,
      pack_stats: prepared.pack.stats,
    });

    try {
      const response = await firstValueFrom(
        this.httpService
          .post(`${this.trainServiceUrl}/training/pipeline/sft-then-dpo`, {
            task_id: taskId,
            config: finalConfig,
            resume_from_checkpoint: resumeFromCheckpoint,
          })
          .pipe(timeout(60_000)),
      );

      const run = this.pipelineRuns.get(taskId)!;
      run.stage = 'sft_running';
      run.updated_at = new Date().toISOString();
      this.pipelineRuns.set(taskId, run);

      this.schedulePipelineShadowDeployMonitor(taskId);

      return {
        ...(response as AxiosResponse).data,
        pipeline_stage: 'sft_running',
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.markPipelineFailed(taskId, msg);
      throw new Error(`Failed to start sft_then_dpo pipeline: ${msg}`);
    }
  }

  /**
   * 轮询直至 pipeline 完成或失败（生产调度用）。
   */
  async waitForPipelineCompletion(
    taskId: string,
    options?: { pollIntervalMs?: number; timeoutMs?: number },
  ): Promise<SftThenDpoPipelineStatus> {
    const pollIntervalMs = options?.pollIntervalMs ?? 15_000;
    const timeoutMs = options?.timeoutMs ?? 86_400_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.getPipelineStatus(taskId);
      if (
        status.stage === 'completed' ||
        status.stage === 'failed' ||
        status.stage === 'cancelled'
      ) {
        if (status.stage === 'completed') {
          await this.triggerShadowDeployIfReady(status);
        }
        return status;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    throw new Error(`Pipeline ${taskId} timed out after ${timeoutMs}ms`);
  }

  /**
   * 合并 Nest 本地状态与 Python 训练服务状态。
   */
  async getPipelineStatus(taskId: string): Promise<SftThenDpoPipelineStatus> {
    const local = this.pipelineRuns.get(taskId);
    let python: TrainingTask | null = null;

    try {
      python = await this.getTrainingStatus(taskId);
    } catch {
      python = null;
    }

    const pyStage = (python?.metrics as Record<string, string> | undefined)?.pipeline_stage
      ?? python?.pipeline_stage
      ?? (python as TrainingTask & { pipeline_stage?: string })?.pipeline_stage;

    const stage = this.resolvePipelineStage(local?.stage, pyStage, python?.status);

    const status: SftThenDpoPipelineStatus = {
      task_id: taskId,
      stage,
      config: (local?.config ?? python?.config ?? this.defaultConfig) as SftThenDpoPipelineStatus['config'],
      created_at: local?.created_at ?? python?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pack_stats: local?.pack_stats,
      checkpoint_sft_final:
        local?.checkpoint_sft_final ??
        (python as TrainingTask & { checkpoint_sft_final?: string })?.checkpoint_sft_final ??
        (python?.metrics as Record<string, string>)?.checkpoint_sft_final,
      production_adapter_path:
        local?.production_adapter_path ??
        (python as TrainingTask & { production_adapter_path?: string })?.production_adapter_path ??
        (python?.metrics as Record<string, string>)?.production_adapter_path,
      error: local?.error ?? python?.error,
      python_status: python?.status,
      python_progress: python?.progress,
      python_metrics: python?.metrics,
    };

    if (local) {
      const updated: SftThenDpoPipelineRun = {
        ...local,
        stage: status.stage,
        updated_at: status.updated_at,
        checkpoint_sft_final: status.checkpoint_sft_final,
        production_adapter_path: status.production_adapter_path,
        error: status.error,
      };
      this.pipelineRuns.set(taskId, updated);
    }

    return status;
  }

  getLocalPipelineRun(taskId: string): SftThenDpoPipelineRun | undefined {
    return this.pipelineRuns.get(taskId);
  }

  private applyTrainingEnvDefaults(config: FineTuneConfig): void {
    const sftEpochs = this.configService.get<string>('TRAINING_SFT_NUM_EPOCHS');
    if (sftEpochs && !config.sft_num_epochs) {
      config.sft_num_epochs = Number(sftEpochs);
    }
    const dpoEpochs = this.configService.get<string>('TRAINING_DPO_NUM_EPOCHS');
    if (dpoEpochs && !config.dpo_num_epochs) {
      config.dpo_num_epochs = Number(dpoEpochs);
    }
    const sftLr = this.configService.get<string>('TRAINING_SFT_LEARNING_RATE');
    if (sftLr && !config.sft_learning_rate) {
      config.sft_learning_rate = Number(sftLr);
    }
    const dpoLr = this.configService.get<string>('TRAINING_DPO_LEARNING_RATE');
    if (dpoLr && !config.dpo_learning_rate) {
      config.dpo_learning_rate = Number(dpoLr);
    }
    if (!config.training_stage) {
      const stage = this.configService.get<string>('TRAINING_STAGE')?.trim();
      if (stage === 'sft' || stage === 'dpo' || stage === 'sft_then_dpo') {
        config.training_stage = stage;
      }
    }
  }

  private validateSftThenDpoPack(pack: DecisionTrajectoryTrainingPackResult): void {
    if (pack.stats.sft_repair_chains < 1) {
      throw new Error(
        'sft_then_dpo blocked: no SFT repair chains. ' +
          'Need VERIFY→REPAIR trajectories before topology DPO (mode collapse guard).',
      );
    }
    const dpoTotal =
      pack.stats.dpo_planner_obedience + pack.stats.dpo_debate_narrator;
    if (dpoTotal < 1) {
      throw new Error('sft_then_dpo blocked: no DPO preference pairs exported');
    }
    this.logger.log(
      `[Pipeline] pack validated: repair_sft=${pack.stats.sft_repair_chains} ` +
        `dpo_planner=${pack.stats.dpo_planner_obedience} ` +
        `true_topology=${pack.stats.dpo_planner_true_topology}`,
    );
  }

  private resolvePipelineStage(
    local?: SftThenDpoPipelineStage,
    pythonStage?: string,
    pythonStatus?: string,
  ): SftThenDpoPipelineStage {
    if (pythonStatus === 'failed') return 'failed';
    if (pythonStatus === 'cancelled') return 'cancelled';
    if (pythonStatus === 'completed' || pythonStage === 'completed') return 'completed';
    if (pythonStage === 'dpo_running') return 'dpo_running';
    if (pythonStage === 'sft_completed') return 'sft_completed';
    if (pythonStage === 'sft_running') return 'sft_running';
    if (pythonStage === 'failed') return 'failed';
    return local ?? 'pending';
  }

  private markPipelineFailed(taskId: string, error: string): void {
    const run = this.pipelineRuns.get(taskId);
    if (run) {
      run.stage = 'failed';
      run.error = error;
      run.updated_at = new Date().toISOString();
      this.pipelineRuns.set(taskId, run);
    }
  }

  /**
   * 获取训练状态
   */
  async getTrainingStatus(taskId: string): Promise<TrainingTask | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.trainServiceUrl}/training/${taskId}`).pipe(
          timeout(10000),
        ),
      );
      return (response as AxiosResponse).data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      this.logger.error(`Failed to get training status: ${error?.message || error}`);
      throw error;
    }
  }
  
  /**
   * 列出所有训练任务
   */
  async listTrainingTasks(): Promise<TrainingTask[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.trainServiceUrl}/training`).pipe(
          timeout(10000),
        ),
      );
      return (response as AxiosResponse).data;
    } catch (error: any) {
      this.logger.error(`Failed to list training tasks: ${error?.message || error}`);
      return [];
    }
  }
  
  /**
   * 取消训练任务
   */
  async cancelTraining(taskId: string): Promise<{ task_id: string; status: string }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.trainServiceUrl}/training/${taskId}/cancel`).pipe(
          timeout(30000),
        ),
      );
      return (response as AxiosResponse).data;
    } catch (error: any) {
      this.logger.error(`Failed to cancel training: ${error?.message || error}`);
      throw error;
    }
  }
  
  /**
   * 准备训练数据（从 ValidatedTrajectory 导出）
   */
  async prepareTrainingData(options?: {
    minValidationScore?: number;
    minTotalReward?: number;
    maxUsageCount?: number;
    limit?: number;
  }): Promise<{
    dataset_name: string;
    train_samples: number;
    eval_samples: number;
  }> {
    const {
      minValidationScore = 0.85,
      minTotalReward = 0.5,
      maxUsageCount = 3,
      limit = 10000,
    } = options || {};
    
    this.logger.log('Preparing training data from validated trajectories...');

    await this.decisionTrajectorySync?.syncAndPrepareForPythonTraining();

    // 查询高质量轨迹
    const trajectories = await this.prisma.validatedTrajectory.findMany({
      where: {
        validationStatus: 'VALIDATED',
        validationScore: { gte: minValidationScore },
        totalReward: { gte: minTotalReward },
        usedForTrainingCount: { lt: maxUsageCount },
      },
      orderBy: [
        { totalReward: 'desc' },
        { validationScore: 'desc' },
      ],
      take: limit,
    });
    
    this.logger.log(`Found ${trajectories.length} high-quality trajectories`);
    
    if (trajectories.length === 0) {
      return {
        dataset_name: 'tripnara_decision',
        train_samples: 0,
        eval_samples: 0,
      };
    }
    
    // 转换为训练数据格式
    const trainingData: TrainingDataItem[] = [];
    
    for (const trajectory of trajectories) {
      const item = this.convertTrajectoryToTrainingData(trajectory);
      if (item) {
        trainingData.push(item);
      }
    }
    
    // 划分训练集和验证集 (9:1)
    const shuffled = trainingData.sort(() => Math.random() - 0.5);
    const splitIndex = Math.floor(shuffled.length * 0.9);
    const trainData = shuffled.slice(0, splitIndex);
    const evalData = shuffled.slice(splitIndex);
    
    // 上传到训练服务
    try {
      await firstValueFrom(
        this.httpService.post(`${this.trainServiceUrl}/datasets/upload`, {
          name: 'tripnara_decision_train',
          data: trainData,
        }).pipe(timeout(60000)),
      );
      
      await firstValueFrom(
        this.httpService.post(`${this.trainServiceUrl}/datasets/upload`, {
          name: 'tripnara_decision_eval',
          data: evalData,
        }).pipe(timeout(60000)),
      );
      
      // 更新使用次数
      const trajectoryIds = trajectories.map(t => t.id);
      await this.prisma.validatedTrajectory.updateMany({
        where: { id: { in: trajectoryIds } },
        data: { usedForTrainingCount: { increment: 1 } },
      });
      
      this.logger.log(`Training data prepared: ${trainData.length} train, ${evalData.length} eval`);
      
      return {
        dataset_name: 'tripnara_decision',
        train_samples: trainData.length,
        eval_samples: evalData.length,
      };
    } catch (error: any) {
      this.logger.error(`Failed to upload training data: ${error?.message || error}`);
      throw error;
    }
  }
  
  /**
   * 将轨迹转换为训练数据格式
   */
  private convertTrajectoryToTrainingData(trajectory: any): TrainingDataItem | null {
    try {
      const plan = trajectory.plan as any;
      const decisionTrace = trajectory.decisionTrace as any;

      // 构建用户输入
      let userContent = '请帮我规划行程：\n';
      if (plan?.request) {
        const req = plan.request;
        if (req.origin) userContent += `出发地：${req.origin}\n`;
        if (req.destination) userContent += `目的地：${req.destination}\n`;
        if (req.start_date) userContent += `出发日期：${req.start_date}\n`;
        if (req.days) userContent += `天数：${req.days}天\n`;
      }
      
      // 构建助手回复
      let assistantContent = '';
      
      // 添加决策过程
      if (decisionTrace?.steps?.length > 0) {
        assistantContent += '## 决策过程\n\n';
        for (const step of decisionTrace.steps) {
          assistantContent += `### ${step.step_type}\n`;
          if (step.result) {
            assistantContent += `${JSON.stringify(step.result, null, 2)}\n\n`;
          }
        }
      }
      
      // 添加行程方案
      if (plan?.itinerary) {
        assistantContent += '## 行程方案\n\n';
        assistantContent += JSON.stringify(plan.itinerary, null, 2);
        assistantContent += '\n\n';
      }
      
      // 添加解释
      if (plan?.explanation) {
        assistantContent += `## 决策说明\n\n${plan.explanation}\n`;
      }
      
      if (!assistantContent) {
        return null;
      }
      
      return {
        conversations: [
          { from: 'human', value: userContent },
          { from: 'gpt', value: assistantContent },
        ],
      };
    } catch (error: any) {
      this.logger.warn(`Failed to convert trajectory: ${error?.message || error}`);
      return null;
    }
  }
  
  /**
   * 列出已训练的模型
   */
  async listTrainedModels(): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.trainServiceUrl}/models`).pipe(
          timeout(10000),
        ),
      );
      return (response as AxiosResponse).data;
    } catch (error: any) {
      this.logger.error(`Failed to list trained models: ${error?.message || error}`);
      return [];
    }
  }
  
  /**
   * 获取 MLflow 实验列表
   */
  async listExperiments(): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.trainServiceUrl}/mlflow/experiments`).pipe(
          timeout(10000),
        ),
      );
      return (response as AxiosResponse).data;
    } catch (error: any) {
      this.logger.error(`Failed to list experiments: ${error?.message || error}`);
      return [];
    }
  }
  
  /**
   * 获取 MLflow 运行列表
   */
  async listRuns(experimentId: string): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.trainServiceUrl}/mlflow/runs/${experimentId}`).pipe(
          timeout(10000),
        ),
      );
      return (response as AxiosResponse).data;
    } catch (error: any) {
      this.logger.error(`Failed to list runs: ${error?.message || error}`);
      return [];
    }
  }
  
  /**
   * 执行完整的训练流程
   */
  /**
   * Decision OS 自演进飞轮：decision_trajectory ETL → sft_then_dpo 串联训练。
   */
  async runDecisionFlywheelPipeline(options?: {
    config?: Partial<FineTuneConfig>;
    taskId?: string;
    wait?: boolean;
    pollIntervalMs?: number;
    timeoutMs?: number;
  }): Promise<{
    task_id: string;
    status: string;
    pipeline_stage: string;
    production_adapter_path?: string;
    shadow_registration?: {
      registered: boolean;
      shadowVersion?: string;
      reason?: string;
    } | null;
  }> {
    const taskId = options?.taskId ?? `flywheel-${Date.now()}`;
    const config: Partial<FineTuneConfig> = {
      training_stage: 'sft_then_dpo',
      ...options?.config,
    };

    await this.startSftThenDpoPipeline(taskId, config);

    if (!options?.wait) {
      return { task_id: taskId, status: 'started', pipeline_stage: 'sft_running' };
    }

    const finalStatus = await this.waitForPipelineCompletion(taskId, {
      pollIntervalMs: options?.pollIntervalMs,
      timeoutMs: options?.timeoutMs,
    });

    if (finalStatus.stage === 'failed') {
      throw new Error(finalStatus.error ?? `Pipeline ${taskId} failed`);
    }

    const shadow = await this.triggerShadowDeployIfReady(finalStatus);

    return {
      task_id: taskId,
      status: 'completed',
      pipeline_stage: finalStatus.stage,
      production_adapter_path: finalStatus.production_adapter_path,
      shadow_registration: shadow,
    };
  }

  /**
   * 后台监听 pipeline 完成并注册阴影适配器（非阻塞启动场景）。
   */
  schedulePipelineShadowDeployMonitor(taskId: string): void {
    const auto =
      this.configService.get<string>('TRAINING_SHADOW_DEPLOY_AUTO_MONITOR')?.trim() !== '0';
    if (!auto || !this.shadowDeployment?.isShadowDeployEnabled()) return;
    if (this.pipelineShadowMonitors.has(taskId)) return;
    this.pipelineShadowMonitors.add(taskId);

    void (async () => {
      try {
        const status = await this.waitForPipelineCompletion(taskId, {
          pollIntervalMs: Number(
            this.configService.get<string>('TRAINING_PIPELINE_POLL_MS') ?? '15000',
          ),
          timeoutMs: Number(
            this.configService.get<string>('TRAINING_PIPELINE_TIMEOUT_MS') ?? '86400000',
          ),
        });
        if (status.stage === 'completed') {
          await this.triggerShadowDeployIfReady(status);
        }
      } catch (err) {
        this.logger.warn(
          `[Pipeline] shadow monitor failed taskId=${taskId}: ${err instanceof Error ? err.message : err}`,
        );
      } finally {
        this.pipelineShadowMonitors.delete(taskId);
      }
    })();
  }

  private async triggerShadowDeployIfReady(
    pipeline: SftThenDpoPipelineStatus,
  ): Promise<{ registered: boolean; shadowVersion?: string; reason?: string } | null> {
    if (!this.shadowDeployment?.isShadowDeployEnabled()) return null;
    if (!pipeline.production_adapter_path) return { registered: false, reason: 'no_adapter_path' };

    const result = await this.shadowDeployment.onFlywheelPipelineCompleted(pipeline);
    this.logger.log(
      `[Pipeline] shadow deploy taskId=${pipeline.task_id} registered=${result.registered} ` +
        `version=${result.shadowVersion ?? 'n/a'} ${result.reason ?? ''}`,
    );

    if (result.registered && result.shadowVersion) {
      const autoPromote =
        this.configService.get<string>('SHADOW_PROMOTION_AUTO')?.trim() === '1';
      if (autoPromote) {
        const metrics = await this.getShadowPromotionStatus(result.shadowVersion);
        if (metrics.promotionReady) {
          await this.shadowDeployment.promote(result.shadowVersion);
        }
      }
    }

    return result;
  }

  getShadowPromotionStatus(shadowVersion: string) {
    if (!this.shadowDeployment) {
      throw new Error('Shadow deployment workflow not available');
    }
    return this.shadowDeployment.getShadowMetrics(shadowVersion);
  }

  async runFullTrainingPipeline(options?: {
    config?: Partial<FineTuneConfig>;
    minValidationScore?: number;
    minTotalReward?: number;
    useDecisionFlywheel?: boolean;
  }): Promise<{
    task_id: string;
    data_preparation?: {
      train_samples: number;
      eval_samples: number;
    };
    status: string;
    pipeline_stage?: string;
  }> {
    const taskId = `train-${Date.now()}`;
    const useFlywheel =
      options?.useDecisionFlywheel ??
      this.configService.get<string>('TRAINING_STAGE')?.trim() === 'sft_then_dpo';

    if (useFlywheel) {
      this.logger.log(`Starting decision flywheel pipeline: ${taskId}`);
      const result = await this.runDecisionFlywheelPipeline({
        taskId,
        config: options?.config,
        wait: false,
      });
      return {
        task_id: result.task_id,
        status: result.status,
        pipeline_stage: result.pipeline_stage,
      };
    }

    this.logger.log(`Starting full training pipeline: ${taskId}`);

    const dataResult = await this.prepareTrainingData({
      minValidationScore: options?.minValidationScore,
      minTotalReward: options?.minTotalReward,
    });

    if (dataResult.train_samples === 0) {
      throw new Error('No training data available');
    }

    await this.startTraining(taskId, options?.config);

    return {
      task_id: taskId,
      data_preparation: {
        train_samples: dataResult.train_samples,
        eval_samples: dataResult.eval_samples,
      },
      status: 'started',
    };
  }
}
