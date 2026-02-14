export declare class RateLimiterService {
    private readonly logger;
    private readonly buckets;
    checkRateLimit(key: string, config: RateLimitConfig): Promise<{
        allowed: boolean;
        remaining: number;
    }>;
    private getOrCreateBucket;
    getRemainingTokens(key: string): number;
    reset(key: string): void;
}
export interface RateLimitConfig {
    capacity: number;
    refillRate: number;
}
