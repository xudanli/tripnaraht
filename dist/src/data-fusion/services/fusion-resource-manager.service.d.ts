export declare class FusionResourceManagerService {
    private readonly logger;
    private readonly cacheSizeLimit;
    private readonly cacheAccessOrder;
    private accessCounter;
    private readonly maxConcurrency;
    private currentConcurrency;
    private readonly concurrencyQueue;
    private readonly rateLimitTokens;
    private currentTokens;
    private readonly tokenRefillRate;
    private lastRefillTime;
    updateCacheAccess(key: string, cache: Map<string, any>): void;
    private evictLRUEntries;
    acquireConcurrency(): Promise<void>;
    releaseConcurrency(): void;
    acquireRateLimitToken(): Promise<void>;
    private refillTokens;
    getResourceStats(): {
        cacheSize: number;
        currentConcurrency: number;
        maxConcurrency: number;
        queueLength: number;
        currentTokens: number;
        maxTokens: number;
    };
}
