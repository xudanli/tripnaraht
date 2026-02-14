export declare class ActionCacheService {
    private readonly logger;
    private readonly cache;
    private readonly defaultTTL;
    private readonly maxCacheSize;
    private readonly resolverVersion;
    generateCacheKey(actionName: string, input: any, customKey?: string): string;
    private normalizeInput;
    private stableStringify;
    private processCustomCacheKey;
    get(key: string): any | null;
    set(key: string, value: any, ttl?: number): void;
    delete(key: string): void;
    clear(): void;
    deleteByPattern(pattern: string): void;
    getStats(): {
        size: number;
        maxSize: number;
        hitRate?: number;
    };
    private evictOldest;
    cleanupExpired(): number;
}
