export interface PriceForecast {
    countryCode: string;
    month: number;
    routeDirectionId?: string;
    budgetRange: {
        min: number;
        max: number;
        median: number;
        percentile25: number;
        percentile75: number;
    };
    costBreakdown: {
        flight?: {
            min: number;
            max: number;
            median: number;
        };
        hotel?: {
            min: number;
            max: number;
            median: number;
        };
        carRental?: {
            min: number;
            max: number;
            median: number;
        };
        guide?: {
            min: number;
            max: number;
            median: number;
        };
        food?: {
            min: number;
            max: number;
            median: number;
        };
    };
    confidence: number;
    dataSource: 'HISTORICAL' | 'THIRD_PARTY_API' | 'MODEL_PREDICTION';
    metadata?: Record<string, any>;
}
export interface CrowdForecast {
    countryCode: string;
    month: number;
    regionId?: string;
    poiId?: string;
    crowdLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    crowdScore: number;
    estimatedVisitorCount?: number;
    recommendedOffPeakMonths?: number[];
    confidence: number;
    metadata?: Record<string, any>;
}
export interface RouteRiskForecast {
    countryCode: string;
    month: number;
    routeDirectionId: string;
    segmentId?: string;
    closureProbability: number;
    weatherRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    weatherRiskScore: number;
    riskItems: Array<{
        type: 'ROAD_CLOSURE' | 'WEATHER' | 'AVALANCHE' | 'FLOOD' | 'OTHER';
        probability: number;
        severity: 'LOW' | 'MEDIUM' | 'HIGH';
        description: string;
    }>;
    confidence: number;
    metadata?: Record<string, any>;
}
export interface RouteAbandonmentForecast {
    routeDirectionId: string;
    userProfile: {
        preferredPace?: 'SLOW' | 'MEDIUM' | 'FAST';
        riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
        fitness?: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    abandonmentProbability: number;
    predictedReasons: Array<{
        reason: string;
        probability: number;
    }>;
    confidence: number;
    metadata?: Record<string, any>;
}
export interface FatigueFailureForecast {
    routeDirectionId: string;
    humanCapability: {
        maxDailyAscentM: number;
        rollingAscent3DaysM: number;
        maxSlopePct: number;
    };
    failureProbability: number;
    predictedFailureDay?: number;
    predictedFailureReason?: 'FATIGUE' | 'ALTITUDE_SICKNESS' | 'OVER_EXERTION';
    confidence: number;
    metadata?: Record<string, any>;
}
export interface IMoBagelForecastService {
    getPriceForecast(countryCode: string, month: number, routeDirectionId?: string): Promise<PriceForecast>;
    getCrowdForecast(countryCode: string, month: number, regionId?: string, poiId?: string): Promise<CrowdForecast>;
    getRouteRiskForecast(countryCode: string, month: number, routeDirectionId: string, segmentId?: string): Promise<RouteRiskForecast>;
    getRouteAbandonmentForecast(routeDirectionId: string, userProfile: RouteAbandonmentForecast['userProfile']): Promise<RouteAbandonmentForecast>;
    getFatigueFailureForecast(routeDirectionId: string, humanCapability: FatigueFailureForecast['humanCapability']): Promise<FatigueFailureForecast>;
}
export interface PhysicalRealityTag {
    type: 'PRICE' | 'CROWD' | 'RISK' | 'ABANDONMENT' | 'FATIGUE';
    value: {
        level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
        score: number;
        probability?: number;
        metadata?: Record<string, any>;
    };
    source: 'MOBAGEL' | 'HISTORICAL' | 'THIRD_PARTY';
    confidence: number;
}
