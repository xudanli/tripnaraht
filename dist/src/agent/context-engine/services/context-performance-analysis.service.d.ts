import { PrismaService } from '../../../prisma/prisma.service';
import { ContextPrometheusMetricsService } from './context-prometheus-metrics.service';
export interface PerformanceAnalysisReport {
    timestamp: Date;
    timeRange: {
        start: Date;
        end: Date;
    };
    buildPerformance: {
        avgBuildTimeMs: number;
        p95BuildTimeMs: number;
        p99BuildTimeMs: number;
        totalBuilds: number;
        buildRate: number;
    };
    cachePerformance: {
        l1HitRate: number;
        l2HitRate: number;
        l3HitRate: number;
        overallHitRate: number;
        cacheSizes: {
            l1: number;
            l2: number;
            l3: number;
        };
    };
    tokenUsage: {
        avgTokenUsage: number;
        avgTokenBudget: number;
        budgetUtilization: number;
        overBudgetCount: number;
    };
    blockStats: {
        avgBlockCount: number;
        blockTypeDistribution: Record<string, number>;
        avgPriority: number;
    };
    learningPerformance?: {
        totalEvents: number;
        avgProcessingTimeMs: number;
        avgConfidence: number;
        avgSampleSize: number;
        priorityUpdates: number;
    };
    bottlenecks: Array<{
        type: 'build_time' | 'cache_miss' | 'token_over_budget' | 'learning_slow';
        severity: 'low' | 'medium' | 'high';
        description: string;
        recommendation: string;
    }>;
    recommendations: string[];
}
export declare class ContextPerformanceAnalysisService {
    private readonly prisma?;
    private readonly metrics?;
    private readonly logger;
    constructor(prisma?: PrismaService, metrics?: ContextPrometheusMetricsService);
    generateReport(timeRange: {
        start: Date;
        end: Date;
    }, options?: {
        includeLearning?: boolean;
        includeBottlenecks?: boolean;
    }): Promise<PerformanceAnalysisReport>;
    private identifyBottlenecks;
    private generateRecommendations;
    exportReportAsJson(report: PerformanceAnalysisReport): Promise<string>;
    exportReportAsMarkdown(report: PerformanceAnalysisReport): Promise<string>;
}
