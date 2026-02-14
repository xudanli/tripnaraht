import { OnModuleDestroy } from '@nestjs/common';
export declare class RedisCacheService implements OnModuleDestroy {
    private readonly logger;
    private client;
    private isConnected;
    constructor();
    private initialize;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean>;
    del(key: string): Promise<boolean>;
    delPattern(pattern: string): Promise<number>;
    exists(key: string): Promise<boolean>;
    ttl(key: string): Promise<number>;
    incr(key: string, increment?: number): Promise<number>;
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    flushAll(): Promise<boolean>;
    isReady(): boolean;
    ping(): Promise<boolean>;
    info(): Promise<string | null>;
    onModuleDestroy(): Promise<void>;
}
