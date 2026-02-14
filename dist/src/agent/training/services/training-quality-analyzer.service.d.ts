import { PrismaService } from '../../../prisma/prisma.service';
export declare class TrainingQualityAnalyzerService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    analyzeQuality(options?: {
        startDate?: Date;
        endDate?: Date;
        modelVersion?: string;
        countryCode?: string;
        minScore?: number;
        minReward?: number;
    }): Promise<QualityAnalysisReport>;
    private analyzeDistribution;
    private analyzeTrends;
    private detectAnomalies;
    private generateSummary;
    private calculateQualityGrade;
    private calculateTrend;
    private getWeekKey;
    private calculateMean;
    private calculateMedian;
    private calculateStdDev;
}
export interface QualityAnalysisReport {
    summary: QualitySummary;
    distribution: DistributionAnalysis;
    trends: TrendAnalysis;
    anomalies: AnomalyDetection;
    timestamp: Date;
}
export interface QualitySummary {
    totalTrajectories: number;
    highQualityCount: number;
    highQualityPercentage: number;
    avgScore: number;
    avgReward: number;
    scoreTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
    rewardTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
    qualityGrade: 'A' | 'B' | 'C' | 'D';
}
export interface DistributionAnalysis {
    score: {
        mean: number;
        median: number;
        stdDev: number;
        min: number;
        max: number;
        distribution: Record<string, number>;
    };
    reward: {
        mean: number;
        median: number;
        stdDev: number;
        min: number;
        max: number;
        distribution: Record<string, number>;
    };
    byModelVersion: Record<string, number>;
    byCountry: Record<string, number>;
    byWeek: Record<string, number>;
}
export interface TrendAnalysis {
    scoreTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
    rewardTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
    dataPoints: Array<{
        week: string;
        avgScore: number;
        avgReward: number;
        count: number;
    }>;
}
export interface AnomalyDetection {
    scoreOutliers: {
        count: number;
        percentage: number;
        trajectoryIds: string[];
    };
    rewardOutliers: {
        count: number;
        percentage: number;
        trajectoryIds: string[];
    };
}
