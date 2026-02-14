import { OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
export interface AirbnbCallMetrics {
    timestamp: number;
    toolName: string;
    success: boolean;
    responseTime: number;
    resultCount?: number;
    error?: string;
}
export interface AirbnbDailyStats {
    date: string;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    avgResponseTime: number;
    callsByTool: Record<string, number>;
    estimatedCost: number;
}
export declare class AirbnbMonitoringService implements OnModuleInit {
    private readonly redisService?;
    private readonly logger;
    private readonly metricsKeyPrefix;
    private readonly statsKeyPrefix;
    private readonly pricing;
    constructor(redisService?: RedisService);
    onModuleInit(): Promise<void>;
    recordCall(metrics: AirbnbCallMetrics): Promise<void>;
    private updateDailyStats;
    getDailyStats(date: string): Promise<AirbnbDailyStats | null>;
    getRecentStats(days?: number): Promise<AirbnbDailyStats[]>;
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
