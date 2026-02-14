import { DataSourceRouterService } from './data-source-router.service';
import { IcelandSafetyAdapter } from '../adapters/iceland-safety.adapter';
import { IcelandFRoadService } from './iceland-froad.service';
import { IcelandAuroraAdapter } from '../adapters/iceland-aurora.adapter';
import { RoadStatusQuery, ExtendedRoadStatus } from '../interfaces/road-status.interface';
import { WeatherQuery, ExtendedWeatherData } from '../interfaces/weather.interface';
import { IcelandSafetyAlert, RouteRiskAssessment, CarRentalInsurance } from '../interfaces/iceland-specific.interface';
export declare class IcelandComprehensiveService {
    private readonly router;
    private readonly safetyAdapter;
    private readonly fRoadService;
    private readonly auroraAdapter;
    private readonly logger;
    constructor(router: DataSourceRouterService, safetyAdapter: IcelandSafetyAdapter, fRoadService: IcelandFRoadService, auroraAdapter: IcelandAuroraAdapter);
    getComprehensiveRoadStatus(query: RoadStatusQuery): Promise<ExtendedRoadStatus>;
    getComprehensiveWeather(query: WeatherQuery): Promise<ExtendedWeatherData>;
    getSafetyAlerts(lat?: number, lng?: number): Promise<IcelandSafetyAlert[]>;
    getCriticalSafetyAlerts(lat?: number, lng?: number): Promise<IcelandSafetyAlert[]>;
    assessRouteRisk(routeSegments: Array<{
        roadNumber?: string;
        roadType?: string;
        isGravel?: boolean;
    }>, vehicleType?: '2WD' | '4WD', insurance?: CarRentalInsurance[]): RouteRiskAssessment;
    isVehicleSuitableForRoute(vehicleType: '2WD' | '4WD', routeSegments: Array<{
        roadNumber?: string;
    }>): {
        suitable: boolean;
        reason?: string;
    };
    getAuroraVisibility(lat: number, lng: number): Promise<'none' | 'low' | 'moderate' | 'high'>;
    getAuroraForecast(lat: number, lng: number, hours?: number): Promise<{
        time: Date;
        kpIndex: number;
        cloudCover: number;
        visibility: "none" | "low" | "moderate" | "high";
    }[]>;
    getComprehensiveSafetyAssessment(lat: number, lng: number, routeSegments?: Array<{
        roadNumber?: string;
        roadType?: string;
        isGravel?: boolean;
    }>): Promise<{
        roadStatus: ExtendedRoadStatus;
        weather: ExtendedWeatherData;
        safetyAlerts: IcelandSafetyAlert[];
        routeRisk?: RouteRiskAssessment;
        overallRiskLevel: 0 | 1 | 2 | 3;
        recommendations: string[];
    }>;
}
