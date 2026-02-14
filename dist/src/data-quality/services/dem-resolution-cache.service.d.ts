export declare class DEMResolutionCacheService {
    private readonly logger;
    private readonly cache;
    private readonly TTL_MS;
    getResolution(tableName: string, calculateFn: () => Promise<string>): Promise<string>;
    clearCache(tableName?: string): void;
    getCacheStats(): {
        size: number;
        entries: Array<{
            tableName: string;
            resolution: string;
            ageMs: number;
        }>;
    };
}
