import { ContextPackage } from '../types/context-package.types';
import { ContextMetricsSummary, ContextMetricsRecord } from '../services/context-metrics.service';
export declare class GetContextPackagesQueryDto {
    page?: number;
    limit?: number;
    tripId?: string;
    phase?: string;
    agent?: string;
    startTime?: string;
    endTime?: string;
    search?: string;
}
export declare class ContextPackageListItemDto {
    id: string;
    tripId?: string;
    phase: string;
    agent: string;
    userQuery: string;
    blocksCount: number;
    totalTokens: number;
    tokenBudget: number;
    compressed: boolean;
    createdAt: string;
}
export declare class ContextPackageListResponseDto {
    packages: ContextPackageListItemDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export declare class ContextPackageDetailResponseDto {
    package: ContextPackage;
    metrics?: ContextMetricsRecord;
}
export declare class GetContextMetricsQueryDto {
    tripId?: string;
    phase?: string;
    agent?: string;
    startTime?: string;
    endTime?: string;
}
export declare class ContextMetricsResponseDto {
    summary: ContextMetricsSummary;
    byAgent: Record<string, {
        count: number;
        avgTokens: number;
        avgBuildTimeMs: number;
        cacheHitRate: number;
    }>;
    byPhase: Record<string, {
        count: number;
        avgTokens: number;
        avgBuildTimeMs: number;
        cacheHitRate: number;
    }>;
}
export declare class GetContextAnalyticsQueryDto {
    startTime?: string;
    endTime?: string;
    granularity?: 'hour' | 'day' | 'week' | 'month';
}
export declare class TokenUsageTrendPoint {
    timestamp: string;
    avgTokens: number;
    maxTokens: number;
    minTokens: number;
    count: number;
}
export declare class ContextAnalyticsResponseDto {
    tokenUsageTrend: TokenUsageTrendPoint[];
    cacheHitRateTrend: Array<{
        timestamp: string;
        cacheHitRate: number;
        count: number;
    }>;
    compressionAnalysis: {
        avgCompressionRate: number;
        compressionRateDistribution: Array<{
            range: string;
            count: number;
        }>;
    };
    qualityAnalysis: {
        distribution: Record<string, number>;
        trend: Array<{
            timestamp: string;
            excellent: number;
            good: number;
            fair: number;
            poor: number;
        }>;
    };
    topBlockTypes: Array<{
        type: string;
        count: number;
        avgTokens: number;
    }>;
    performanceBottlenecks: Array<{
        agent: string;
        phase: string;
        avgBuildTimeMs: number;
        count: number;
    }>;
}
