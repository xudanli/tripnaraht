import { RedisService } from '../../redis/redis.service';
export interface EmbeddingCacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    totalRequests: number;
    cacheSize: number;
    avgLatencyMs: number;
}
export declare class EmbeddingCacheService {
    private readonly redisService?;
    private readonly logger;
    private readonly CACHE_PREFIX;
    private readonly DEFAULT_TTL;
    private readonly memoryCache;
    private stats;
    constructor(redisService?: RedisService);
    private generateCacheKey;
    get(text: string): Promise<number[] | null>;
    set(text: string, embedding: number[], ttl?: number): Promise<void>;
    delete(text: string): Promise<void>;
    clear(): Promise<void>;
    getStats(): EmbeddingCacheStats;
    resetStats(): void;
    private recordHit;
    private recordMiss;
    private cleanExpiredMemoryCache;
}
