import { IMoBagelForecastService, PriceForecast, CrowdForecast, RouteRiskForecast, RouteAbandonmentForecast, FatigueFailureForecast } from './mobagel-forecast.interface';
export declare class MoBagelForecastService implements IMoBagelForecastService {
    private readonly logger;
    getPriceForecast(countryCode: string, month: number, routeDirectionId?: string): Promise<PriceForecast>;
    getCrowdForecast(countryCode: string, month: number, regionId?: string, poiId?: string): Promise<CrowdForecast>;
    getRouteRiskForecast(countryCode: string, month: number, routeDirectionId: string, segmentId?: string): Promise<RouteRiskForecast>;
    getRouteAbandonmentForecast(routeDirectionId: string, userProfile: RouteAbandonmentForecast['userProfile']): Promise<RouteAbandonmentForecast>;
    getFatigueFailureForecast(routeDirectionId: string, humanCapability: FatigueFailureForecast['humanCapability']): Promise<FatigueFailureForecast>;
}
