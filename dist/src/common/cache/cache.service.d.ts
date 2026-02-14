import { RedisService } from '../../redis/redis.service';
export declare class CacheService {
    private readonly redisService?;
    private readonly logger;
    private memoryCache;
    constructor(redisService?: RedisService);
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttl: number): Promise<void>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    generateKey(prefix: string, ...parts: (string | number)[]): string;
    private cleanupExpiredEntries;
    clear(): void;
}
