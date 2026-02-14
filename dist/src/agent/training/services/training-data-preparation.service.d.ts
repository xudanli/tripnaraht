import { PrismaService } from '../../../prisma/prisma.service';
export declare class TrainingDataPreparationService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    prepareTrainingBatch(options?: {
        minScore?: number;
        minReward?: number;
        maxUsageCount?: number;
        batchSize?: number;
        modelVersion?: string;
        countryCode?: string;
    }): Promise<TrainingBatch>;
    markAsUsed(trajectoryIds: string[], batchId: string): Promise<void>;
    exportToJSONL(batch: TrainingBatch, outputPath: string): Promise<{
        filePath: string;
        lineCount: number;
    }>;
    exportToJSON(batch: TrainingBatch, outputPath: string): Promise<{
        filePath: string;
        recordCount: number;
    }>;
    private formatUserInput;
    private formatAssistantOutput;
    private convertToSFTFormat;
    private extractUserRequest;
    private extractReasoning;
    private calculateAverage;
}
export interface SFTTrainingExample {
    input: {
        user_request: string;
        research_data: any;
        gate_result: any;
        compliance_result: any;
    };
    output: {
        plan: any;
        decision_trace: any;
        reasoning: string;
    };
    metadata: {
        trajectory_id: string;
        request_id: string;
        trip_id: string | null;
        validation_score: number;
        total_reward: number;
        model_version: string;
        timestamp: string;
    };
}
export interface TrainingBatch {
    batchId: string;
    trajectories: Array<{
        trajectoryId: string;
        requestId: string;
        tripId: string | null;
        validationScore: number;
        totalReward: number;
        modelVersion: string;
    }>;
    trainingData: SFTTrainingExample[];
    stats: {
        totalTrajectories: number;
        avgScore: number;
        avgReward: number;
        minScore: number;
        maxScore: number;
        minReward: number;
        maxReward: number;
        modelVersions: string[];
        countryCodes: string[];
    };
    createdAt: Date;
}
