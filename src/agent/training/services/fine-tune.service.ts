import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';

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
  
  /** 默认训练配置 */
  private defaultConfig: FineTuneConfig = {
    model_name: 'Qwen/Qwen2.5-7B-Instruct',
    lora_rank: 64,
    lora_alpha: 128,
    learning_rate: 2e-4,
    num_epochs: 3,
    batch_size: 2,
    dataset_name: 'tripnara_decision',
  };
  
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
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
  ): Promise<{ task_id: string; status: string; message: string }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    this.logger.log(`Starting training task: ${taskId}`);
    this.logger.log(`Config: ${JSON.stringify(finalConfig)}`);
    
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
  async runFullTrainingPipeline(options?: {
    config?: Partial<FineTuneConfig>;
    minValidationScore?: number;
    minTotalReward?: number;
  }): Promise<{
    task_id: string;
    data_preparation: {
      train_samples: number;
      eval_samples: number;
    };
    status: string;
  }> {
    const taskId = `train-${Date.now()}`;
    
    this.logger.log(`Starting full training pipeline: ${taskId}`);
    
    // 1. 准备训练数据
    const dataResult = await this.prepareTrainingData({
      minValidationScore: options?.minValidationScore,
      minTotalReward: options?.minTotalReward,
    });
    
    if (dataResult.train_samples === 0) {
      throw new Error('No training data available');
    }
    
    // 2. 启动训练
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
