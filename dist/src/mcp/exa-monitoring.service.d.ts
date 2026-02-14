import { OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
export interface ExaCallMetrics {
    timestamp: number;
    toolName: string;
    success: boolean;
    responseTime: number;
    resultCount?: number;
    error?: string;
}
export interface ExaDailyStats {
    date: string;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    avgResponseTime: number;
    callsByTool: Record<string, number>;
    estimatedCost: number;
}
export declare class ExaMonitoringService implements OnModuleInit {
    private readonly redisService?;
    private readonly logger;
    private readonly metricsKeyPrefix;
    private readonly statsKeyPrefix;
    private readonly pricing;
    constructor(redisService?: RedisService);
    onModuleInit(): Promise<void>;
    recordCall(metrics: ExaCallMetrics): Promise<void>;
    private updateDailyStats;
    getDailyStats(date: string): Promise<ExaDailyStats | null>;
    getRecentStats(days?: number): Promise<ExaDailyStats[]>;
    getTotalCostEstimate(days?: number): Promise<number>;
    checkCostLimit(dailyLimit?: number): Promise<{
        exceeded: boolean;
        currentCost: number;
        limit: number;
    }>;
    getPerformanceMetrics(days?: number): Promise<{
        avgResponseTime: number;
        successRate: number;
        totalCalls: number;
        callsByTool: Record<string, number>;
    }>;
}
