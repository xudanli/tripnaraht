import { PrismaService } from '../../../prisma/prisma.service';
export declare class ModelCollapseMonitorService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    detectCollapseRisk(options?: {
        modelVersion?: string;
        lookbackDays?: number;
        minTrajectories?: number;
    }): Promise<CollapseRiskReport>;
    private analyzePerformanceTrend;
    private calculateDiversityScore;
    private calculateTrajectorySimilarity;
    private analyzeDiversityTrend;
    private detectDistributionShift;
    private calculateRiskScore;
    private determineRiskLevel;
    private generateRecommendations;
    private calculateAverage;
    private calculateStdDev;
}
export interface CollapseRiskReport {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    riskScore: number;
    indicators: {
        performanceTrend: 'DECLINING' | 'STABLE' | 'IMPROVING' | 'INSUFFICIENT_DATA';
        diversityTrend: 'DECLINING' | 'STABLE' | 'IMPROVING' | 'INSUFFICIENT_DATA';
        distributionShift: 'SHIFT_DETECTED' | 'STABLE' | 'INSUFFICIENT_DATA';
    };
    metrics: {
        trajectoryCount: number;
        avgScore: number;
        avgReward: number;
        diversityScore: number;
    };
    recommendations: string[];
    timestamp: Date;
}
