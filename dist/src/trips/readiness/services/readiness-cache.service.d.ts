import { RedisService } from '../../../redis/redis.service';
import { ReadinessCheckResult } from '../types/readiness-findings.types';
import { UserProfile } from '../types/ai-enhanced.types';
interface CacheVersion {
    version: string;
    timestamp: number;
    rulesEngineVersion: string;
}
export declare class ReadinessCacheService {
    private readonly redisService?;
    private readonly logger;
    private readonly memoryCache;
    private readonly L1_TTL_MS;
    private readonly CACHE_VERSION_KEY;
    constructor(redisService?: RedisService);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, data: T, options?: {
        ttl?: number;
    }): Promise<void>;
    del(key: string): Promise<void>;
    generateCacheKey(type: string, baseResult: ReadinessCheckResult, userProfile?: UserProfile): string;
    private hashUserProfile;
    private hashResult;
    getCacheVersion(): Promise<CacheVersion>;
    updateCacheVersion(rulesEngineVersion?: string): Promise<void>;
    private checkCacheVersion;
    private incrementVersion;
    invalidateAll(reason: string): Promise<void>;
}
export {};
