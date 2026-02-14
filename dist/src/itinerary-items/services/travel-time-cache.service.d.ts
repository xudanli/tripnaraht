interface CachedTravelTime {
    straightDistance: number;
    roadDistance?: number;
    estimatedDuration: number;
    recommendedTransport: 'WALKING' | 'DRIVING' | 'TRANSIT';
    cachedAt: number;
}
export declare class TravelTimeCacheService {
    private readonly logger;
    private readonly cache;
    private readonly TTL_MS;
    private readonly MAX_ENTRIES;
    get(key: string): Omit<CachedTravelTime, 'cachedAt'> | undefined;
    set(key: string, value: Omit<CachedTravelTime, 'cachedAt'>): void;
    clear(): void;
    getStats(): {
        size: number;
        maxSize: number;
        ttlMs: number;
    };
    private cleanup;
}
export {};
