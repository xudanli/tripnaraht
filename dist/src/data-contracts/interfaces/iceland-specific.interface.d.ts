export interface FRoadInfo {
    roadNumber: string;
    isFRoad: boolean;
    status: 'open' | 'closed' | 'restricted' | 'unknown';
    restrictionReason?: string;
    requires4WD: boolean;
    difficultyLevel?: 1 | 2 | 3 | 4 | 5;
    snowDepth?: number;
    isSlippery?: boolean;
    lastUpdated: Date;
}
export interface RiverCrossingInfo {
    location: {
        lat: number;
        lng: number;
        name?: string;
    };
    riverName?: string;
    waterLevel?: number;
    safeWaterLevel?: number;
    isPassable: boolean;
    riskLevel: 0 | 1 | 2 | 3;
    riskReason?: string;
    recentPrecipitation?: number;
    lastUpdated: Date;
}
export interface CarRentalInsurance {
    type: 'SAAP' | 'GP' | 'SCDW' | 'BASIC';
    name: string;
    isPurchased: boolean;
    description?: string;
}
export interface RouteRiskAssessment {
    routeId: string;
    overallRiskLevel: 0 | 1 | 2 | 3;
    riskReasons: string[];
    fRoadPercentage: number;
    gravelRoadPercentage: number;
    containsFRoad: boolean;
    containsRiverCrossing: boolean;
    insuranceRecommendations: string[];
    segmentRisks: Array<{
        segmentId: string;
        riskLevel: 0 | 1 | 2 | 3;
        riskReason: string;
        fRoadInfo?: FRoadInfo;
        riverCrossingInfo?: RiverCrossingInfo;
    }>;
}
export interface IcelandSafetyAlert {
    id: string;
    type: 'weather' | 'road' | 'volcano' | 'glacier' | 'geothermal' | 'general';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    affectedAreas?: Array<{
        name: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
    }>;
    effectiveTime: Date;
    expiryTime?: Date;
    source: 'safetravel' | 'vedur' | 'road.is';
    metadata?: Record<string, any>;
}
