import { OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
export interface BookingComCallMetrics {
    timestamp: number;
    toolName: string;
    success: boolean;
    responseTime: number;
    resultCount?: number;
    error?: string;
}
export interface BookingComDailyStats {
    date: string;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    avgResponseTime: number;
    callsByTool: Record<string, number>;
    estimatedCost: number;
}
export declare class BookingComMonitoringService implements OnModuleInit {
    private readonly redisService?;
    private readonly logger;
    private readonly metricsKeyPrefix;
    private readonly statsKeyPrefix;
    private readonly pricing;
    constructor(redisService?: RedisService);
    onModuleInit(): Promise<void>;
    recordCall(metrics: BookingComCallMetrics): Promise<void>;
    private updateDailyStats;
    getDailyStats(date: string): Promise<BookingComDailyStats | null>;
    getStatsForDateRange(startDate: string, endDate: string): Promise<BookingComDailyStats[]>;
    getPerformanceSummary(days?: number): Promise<{
        avgResponseTime: number;
        successRate: number;
        totalCalls: number;
        callsByTool: Record<string, number>;
    }>;
    getTotalCostEstimate(days?: number): Promise<number>;
    checkCostLimit(limit: number, days?: number): Promise<{
        exceeded: boolean;
        currentCost: number;
        limit: number;
    }>;
}
