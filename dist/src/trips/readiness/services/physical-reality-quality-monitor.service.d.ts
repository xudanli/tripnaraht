import { PrismaService } from '../../../prisma/prisma.service';
import { PhysicalRealityRetrievalService } from './physical-reality-retrieval.service';
export interface PhysicalRealityQualityMetrics {
    completeness: {
        roadStatus: {
            totalChunks: number;
            totalRegions: number;
            regionsWithData: number;
            coverageRate: number;
            avgChunksPerRegion: number;
        };
        ferrySchedules: {
            totalChunks: number;
            totalRegions: number;
            regionsWithData: number;
            coverageRate: number;
            avgChunksPerRegion: number;
        };
        weatherWindows: {
            totalChunks: number;
            totalRegions: number;
            regionsWithData: number;
            coverageRate: number;
            avgChunksPerRegion: number;
        };
        overall: {
            totalChunks: number;
            totalRegions: number;
            regionsWithData: number;
            coverageRate: number;
        };
    };
    accuracy: {
        metadataCoverage: number;
        embeddingCoverage: number;
        keywordsCoverage: number;
    };
    timeliness: {
        lastUpdated: Date | null;
        oldestUpdated: Date | null;
        avgDaysSinceUpdate: number;
        staleChunks30Days: number;
        staleChunks90Days: number;
    };
    retrievalPerformance: {
        avgLatency: number;
        p95Latency: number;
        successRate: number;
        totalRetrievals: number;
    };
}
export interface QualityReport {
    generatedAt: Date;
    metrics: PhysicalRealityQualityMetrics;
    issues: Array<{
        level: 'info' | 'warning' | 'error';
        category: 'completeness' | 'accuracy' | 'timeliness' | 'performance';
        message: string;
        recommendation?: string;
    }>;
    qualityScore: number;
}
export declare class PhysicalRealityQualityMonitorService {
    private readonly prisma;
    private readonly physicalRealityService?;
    private readonly logger;
    private readonly expectedRegions;
    private retrievalLatencies;
    private retrievalSuccesses;
    private retrievalFailures;
    constructor(prisma: PrismaService, physicalRealityService?: PhysicalRealityRetrievalService);
    generateQualityReport(): Promise<QualityReport>;
    private calculateMetrics;
    private calculateCompleteness;
    private calculateAccuracy;
    private calculateTimeliness;
    private calculateRetrievalPerformance;
    private identifyIssues;
    private calculateQualityScore;
    recordRetrieval(latency: number, success: boolean): void;
    private extractRegionFromFilename;
}
