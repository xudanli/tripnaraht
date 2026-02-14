import { Cache } from 'cache-manager';
export declare class RedisService {
    private cacheManager;
    private readonly logger;
    constructor(cacheManager: Cache);
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    del(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    reset(): Promise<void>;
    generateKey(prefix: string, ...parts: (string | number)[]): string;
}
