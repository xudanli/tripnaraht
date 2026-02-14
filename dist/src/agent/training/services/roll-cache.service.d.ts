import { ConfigService } from '@nestjs/config';
export declare class RollCacheService {
    private readonly configService;
    private readonly logger;
    private readonly cache;
    private readonly defaultTTL;
    private readonly maxSize;
    constructor(configService: ConfigService);
    private generateKey;
    get<T>(prefix: string, key: string): T | null;
    set<T>(prefix: string, key: string, value: T, ttl?: number): void;
    delete(prefix: string, key: string): void;
    clear(prefix?: string): void;
    private cleanExpired;
    private evictOldest;
    getStats(): {
        size: number;
        maxSize: number;
        hitRate?: number;
    };
}
