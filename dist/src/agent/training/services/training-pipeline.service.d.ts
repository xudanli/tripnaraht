import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { TrainingJob, TrainingConfig, ModelConfig, HyperparameterSearchSpace, HyperparameterTuningResult } from '../interfaces/training-platform.interface';
import { TrainingDataPreparationService } from './training-data-preparation.service';
import { DatasetVersionManagerService } from './dataset-version-manager.service';
export declare class TrainingPipelineService {
    private readonly prisma;
    private readonly configService;
    private readonly dataPrepService;
    private readonly versionManager;
    private readonly logger;
    private readonly trainingServiceUrl;
    private readonly jobs;
    constructor(prisma: PrismaService, configService: ConfigService, dataPrepService: TrainingDataPreparationService, versionManager: DatasetVersionManagerService);
    createTrainingJob(datasetVersion: string, modelConfig: ModelConfig, trainingConfig: TrainingConfig, hyperparameterSearch?: {
        enabled: boolean;
        search_space: HyperparameterSearchSpace;
        num_trials?: number;
    }): Promise<TrainingJob>;
    startTraining(jobId: string): Promise<TrainingJob>;
    getTrainingJobStatus(jobId: string): Promise<TrainingJob>;
    cancelTrainingJob(jobId: string): Promise<void>;
    tuneHyperparameters(datasetVersion: string, modelConfig: ModelConfig, searchSpace: HyperparameterSearchSpace, numTrials?: number): Promise<HyperparameterTuningResult>;
    listTrainingJobs(): Promise<TrainingJob[]>;
    private mapTrainingStatus;
}
