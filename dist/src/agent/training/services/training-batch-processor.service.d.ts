import { PrismaService } from '../../../prisma/prisma.service';
import { TrainingDataPreparationService, TrainingBatch } from './training-data-preparation.service';
export declare class TrainingBatchProcessorService {
    private readonly prisma;
    private readonly trainingDataPrep;
    private readonly logger;
    private readonly activeTasks;
    constructor(prisma: PrismaService, trainingDataPrep: TrainingDataPreparationService);
    createBatchTask(options: {
        minScore?: number;
        minReward?: number;
        maxUsageCount?: number;
        batchSize?: number;
        modelVersion?: string;
        countryCode?: string;
        exportFormat?: 'jsonl' | 'json' | 'both' | 'none';
        outputPath?: string;
    }): Promise<BatchTask>;
    private processBatchTask;
    getTaskStatus(taskId: string): BatchTask | null;
    getAllTasks(): BatchTask[];
    getActiveTasks(): BatchTask[];
    cleanupCompletedTasks(keepCount?: number): void;
}
export interface BatchTask {
    taskId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    currentStage: 'preparing' | 'prepared' | 'exporting' | 'completed' | 'failed';
    options: {
        minScore?: number;
        minReward?: number;
        maxUsageCount?: number;
        batchSize?: number;
        modelVersion?: string;
        countryCode?: string;
        exportFormat?: 'jsonl' | 'json' | 'both' | 'none';
        outputPath?: string;
    };
    createdAt: Date;
    updatedAt: Date;
    error: string | null;
    result: {
        batch: TrainingBatch;
        exports?: {
            jsonl?: {
                filePath: string;
                lineCount: number;
            };
            json?: {
                filePath: string;
                recordCount: number;
            };
        };
    } | null;
}
