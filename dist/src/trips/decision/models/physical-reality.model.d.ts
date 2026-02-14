import { DemDecisionEvidence } from '../interfaces/dem-decision-evidence.interface';
export interface RoadState {
    roadId: string;
    status: 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED';
    seasonOpenFrom?: number;
    seasonOpenTo?: number;
    requires4x4?: boolean;
    requiresPermit?: boolean;
    segmentId?: string;
    metadata?: Record<string, any>;
}
export interface HazardZoneState {
    zoneId: string;
    type: 'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER';
    level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    seasonality?: {
        highRiskMonths: number[];
        lowRiskMonths: number[];
    };
    segmentId?: string;
    geom?: any;
    metadata?: Record<string, any>;
}
export interface FerryState {
    ferryId: string;
    routeId: string;
    status: 'RUNNING' | 'CANCELLED' | 'SEASONAL';
    seasonOpenFrom?: number;
    seasonOpenTo?: number;
    lastStatusUpdate?: Date;
    metadata?: Record<string, any>;
}
export interface ClimateSeasonality {
    countryCode: string;
    month: number;
    accessibilityScore: number;
    typicalWeather?: {
        windSpeedMps: number;
        precipitationMmPerHour: number;
        visibilityMeters: number;
        temperatureCelsius: number;
    };
    riskFactors?: string[];
    metadata?: Record<string, any>;
}
export interface PhysicalRealityModel {
    demEvidence: DemDecisionEvidence[];
    roadStates: RoadState[];
    hazardZones: HazardZoneState[];
    ferryStates: FerryState[];
    climateSeasonality?: ClimateSeasonality;
    countryCode: string;
    month: number;
}
export declare function validatePhysicalRealityModel(model: PhysicalRealityModel): {
    valid: boolean;
    missingFields: string[];
};
