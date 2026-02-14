import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
export interface RateLimitOptions {
    userId?: string;
    ipAddress?: string;
    maxRequests: number;
    windowMs: number;
}
export declare class RateLimitService {
    private redisService;
    private configService;
    private readonly logger;
    private readonly anonymousLimit;
    private readonly anonymousWindowMs;
    private readonly authenticatedLimit;
    private readonly authenticatedWindowMs;
    constructor(redisService: RedisService, configService: ConfigService);
    checkRateLimit(userId?: string, ipAddress?: string): Promise<void>;
    getRateLimitInfo(userId?: string, ipAddress?: string): Promise<{
        limit: number;
        remaining: number;
        resetTime: Date;
    }>;
}
