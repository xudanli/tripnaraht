import { RedisService } from '../../redis/redis.service';
import { RouteDirectionRecommendation, UserIntent } from './route-direction-selector.service';
import { ActivityCandidate } from '../../trips/decision/world-model';
export declare class RouteDirectionCacheService {
    private readonly redisService?;
    private readonly logger;
    private readonly RD_SELECTION_CACHE_PREFIX;
    private readonly POI_POOL_CACHE_PREFIX;
    private readonly RD_SELECTION_TTL_MIN;
    private readonly RD_SELECTION_TTL_MAX;
    private readonly POI_POOL_TTL_MIN;
    private readonly POI_POOL_TTL_MAX;
    private readonly memoryCache;
    constructor(redisService?: RedisService);
    private generateRdSelectionCacheKey;
    getCachedRdSelection(countryCode: string, month: number | undefined, userIntent: UserIntent): Promise<RouteDirectionRecommendation[] | null>;
    cacheRdSelection(countryCode: string, month: number | undefined, userIntent: UserIntent, recommendations: RouteDirectionRecommendation[]): Promise<void>;
    private generatePoiPoolCacheKey;
    getCachedPoiPool(routeDirectionId: number, bufferMeters: number, signaturePois?: any): Promise<ActivityCandidate[] | null>;
    cachePoiPool(routeDirectionId: number, bufferMeters: number, pois: ActivityCandidate[], signaturePois?: any): Promise<void>;
    invalidateRdSelectionCache(countryCode: string, month?: number): Promise<void>;
    invalidatePoiPoolCache(routeDirectionId: number): Promise<void>;
    getCacheStats(): Promise<{
        rdSelectionCacheKeys: number;
        poiPoolCacheKeys: number;
    }>;
}
