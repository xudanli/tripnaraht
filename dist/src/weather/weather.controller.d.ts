import { DataSourceRouterService } from '../data-contracts/services/data-source-router.service';
import { HybridCacheService } from '../rag/services/hybrid-cache.service';
export declare class WeatherController {
    private readonly dataSourceRouter;
    private readonly cacheService?;
    constructor(dataSourceRouter: DataSourceRouterService, cacheService?: HybridCacheService);
    getCurrentWeather(lat: string, lng: string, includeWindDetails?: string, includeAuroraInfo?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
