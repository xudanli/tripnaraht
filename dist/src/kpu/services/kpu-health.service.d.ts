import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { LlmService } from '../../llm/services/llm.service';
import { KPUMonitoringService } from './kpu-monitoring.service';
export interface KPUHealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
        database: 'ok' | 'error';
        redis: 'ok' | 'error' | 'disabled';
        llm: 'ok' | 'error' | 'disabled';
    };
    metrics: {
        totalValidations: number;
        successRate: number;
        avgLatency: number;
        cacheHitRate: number;
    };
    timestamp: Date;
}
export declare class KPUHealthService {
    private readonly prisma;
    private readonly redisService;
    private readonly llmService;
    private readonly monitoringService;
    private readonly logger;
    constructor(prisma: PrismaService, redisService: RedisService, llmService: LlmService, monitoringService: KPUMonitoringService);
    checkHealth(): Promise<KPUHealthStatus>;
    private checkDatabase;
    private checkRedis;
    private checkLlm;
}
