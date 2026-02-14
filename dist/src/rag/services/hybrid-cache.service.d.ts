import { RedisCacheService } from './redis-cache.service';
import { RagMetricsService } from './rag-metrics.service';
export declare class HybridCacheService {
    private readonly redisCache?;
    private readonly metrics?;
    private readonly logger;
    private memoryCache;
    constructor(redisCache?: RedisCacheService, metrics?: RagMetricsService);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean>;
    del(key: string): Promise<boolean>;
    delPattern(pattern: string): Promise<number>;
    exists(key: string): Promise<boolean>;
    flushAll(): Promise<boolean>;
    private getFromMemory;
    private setToMemory;
    getStats(): {
        memorySize: number;
        redisConnected: boolean;
    };
    cleanupExpired(): number;
}
