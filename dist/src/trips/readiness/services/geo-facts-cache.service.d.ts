import { GeoFeatures } from './geo-facts.service';
import { RedisService } from '../../../redis/redis.service';
export declare class GeoFactsCacheService {
    private readonly redisService?;
    private readonly logger;
    private readonly memoryCache;
    private readonly L1_TTL_MS;
    private readonly L2_TTL_SEC;
    private readonly CACHE_VERSION;
    constructor(redisService?: RedisService);
    private generateKey;
    get(lat: number, lng: number, options?: any): Promise<GeoFeatures | null>;
    set(lat: number, lng: number, data: GeoFeatures, options?: any): Promise<void>;
    private cleanupL1;
    clear(): Promise<void>;
    getStats(): Promise<{
        l1Size: number;
        l1Keys: string[];
    }>;
    warmup(coordinates: Array<{
        lat: number;
        lng: number;
        options?: any;
    }>, fetcher: (lat: number, lng: number, options?: any) => Promise<GeoFeatures>): Promise<void>;
    updateCacheVersion(newVersion: string): void;
}
