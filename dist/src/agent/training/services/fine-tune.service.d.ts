import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../../prisma/prisma.service';
export interface FineTuneConfig {
    model_name: string;
    lora_rank: number;
    lora_alpha: number;
    learning_rate: number;
    num_epochs: number;
    batch_size: number;
    dataset_name: string;
}
export declare enum TrainingStatus {
    PENDING = "pending",
    RUNNING = "running",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
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
export interface TrainingDataItem {
    conversations: Array<{
        from: 'human' | 'gpt';
        value: string;
    }>;
}
export declare class FineTuneService implements OnModuleInit {
    private readonly configService;
    private readonly httpService;
    private readonly prisma;
    private readonly logger;
    private trainServiceUrl;
    private defaultConfig;
    constructor(configService: ConfigService, httpService: HttpService, prisma: PrismaService);
    onModuleInit(): Promise<void>;
    checkTrainServiceHealth(): Promise<boolean>;
    getGpuInfo(): Promise<any>;
    startTraining(taskId: string, config?: Partial<FineTuneConfig>, resumeFromCheckpoint?: string): Promise<{
        task_id: string;
        status: string;
        message: string;
    }>;
    getTrainingStatus(taskId: string): Promise<TrainingTask | null>;
    listTrainingTasks(): Promise<TrainingTask[]>;
    cancelTraining(taskId: string): Promise<{
        task_id: string;
        status: string;
    }>;
    prepareTrainingData(options?: {
        minValidationScore?: number;
        minTotalReward?: number;
        maxUsageCount?: number;
        limit?: number;
    }): Promise<{
        dataset_name: string;
        train_samples: number;
        eval_samples: number;
    }>;
    private convertTrajectoryToTrainingData;
    listTrainedModels(): Promise<any[]>;
    listExperiments(): Promise<any[]>;
    listRuns(experimentId: string): Promise<any[]>;
    runFullTrainingPipeline(options?: {
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
    }>;
}
