import { PrismaService } from '../../../prisma/prisma.service';
export declare class TrainingMetricsService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getCollectionStats(options?: {
        startDate?: Date;
        endDate?: Date;
        modelVersion?: string;
        countryCode?: string;
    }): Promise<{
        totalTrajectories: number;
        validatedCount: number;
        rejectedCount: number;
        pendingCount: number;
        validationRate: number;
        avgValidationScore: number;
        avgReward: number;
        byModelVersion: Record<string, number>;
        byCountry: Record<string, number>;
    }>;
    getTrainingDataQuality(options?: {
        minScore?: number;
        minReward?: number;
    }): Promise<{
        eligibleCount: number;
        avgScore: number;
        avgReward: number;
        scoreDistribution: {
            '0.8-0.9': number;
            '0.9-0.95': number;
            '0.95-1.0': number;
        };
        rewardDistribution: {
            '0-1': number;
            '1-2': number;
            '2+': number;
        };
    }>;
}
