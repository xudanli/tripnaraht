import { RedisService } from '../../redis/redis.service';
export interface QueryMetrics {
    query: string;
    params?: any[];
    executionTime: number;
    timestamp: Date;
    success: boolean;
    error?: string;
    rowCount?: number;
}
export interface PerformanceStats {
    totalQueries: number;
    avgExecutionTime: number;
    p50ExecutionTime: number;
    p95ExecutionTime: number;
    p99ExecutionTime: number;
    errorRate: number;
    slowQueries: QueryMetrics[];
}
export declare class PostgreSQLMcpMonitoringService {
    private readonly redisService?;
    private readonly logger;
    private readonly metricsKeyPrefix;
    private readonly slowQueryThreshold;
    private readonly maxSlowQueries;
    private readonly slowQueries;
    private readonly dailyStats;
    constructor(redisService?: RedisService);
    recordQueryMetrics(metrics: QueryMetrics): Promise<void>;
    private recordSlowQuery;
    private recordToRedis;
    getPerformanceStats(days?: number): Promise<PerformanceStats>;
    getSlowQueries(limit?: number): Promise<QueryMetrics[]>;
    private getPercentile;
    private getDefaultStats;
}
