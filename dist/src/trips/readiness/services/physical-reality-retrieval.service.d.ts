import { ChunkRetrievalService } from '../../../rag/services/chunk-retrieval.service';
import { PhysicalRealityQualityMonitorService } from './physical-reality-quality-monitor.service';
export interface RoadStateInfo {
    roadId: string;
    roadName: string;
    status: 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED';
    seasonOpenFrom?: number;
    seasonOpenTo?: number;
    requires4x4?: boolean;
    hazards?: Array<{
        type: string;
        severity: string;
        description: string;
    }>;
    coordinates?: {
        start: {
            lat: number;
            lng: number;
            name?: string;
        };
        end: {
            lat: number;
            lng: number;
            name?: string;
        };
    };
    metadata?: any;
}
export interface FerryStateInfo {
    routeId: string;
    routeName: string;
    from: {
        name: string;
        coordinates: {
            lat: number;
            lng: number;
        };
    };
    to: {
        name: string;
        coordinates: {
            lat: number;
            lng: number;
        };
    };
    status: 'RUNNING' | 'CANCELLED' | 'SEASONAL';
    seasonOpenFrom?: number;
    seasonOpenTo?: number;
    schedule?: {
        summer?: {
            frequency: string;
            sailings: any[];
        };
        winter?: {
            frequency: string;
            sailings: any[];
        };
    };
    booking?: {
        required: boolean;
        recommended: boolean;
    };
    metadata?: any;
}
export interface WeatherWindowInfo {
    regionId: string;
    regionName: string;
    bestWindows?: Array<{
        months: number[];
        period: string;
        description: string;
        temperature?: {
            avg: number;
            min: number;
            max: number;
        };
        precipitation?: {
            avg: number;
        };
        wind?: {
            avg: number;
            max: number;
        };
    }>;
    riskLevels?: Array<{
        month: number;
        riskLevel: string;
        risks: string[];
        recommendation: string;
    }>;
    extremeEvents?: Array<{
        type: string;
        severity: string;
        description: string;
        typicalMonths: number[];
    }>;
    coordinates?: {
        center: {
            lat: number;
            lng: number;
        };
        bounds?: {
            north: number;
            south: number;
            east: number;
            west: number;
        };
    };
    metadata?: any;
}
export interface PhysicalRealityData {
    roadStates: RoadStateInfo[];
    ferryStates: FerryStateInfo[];
    weatherWindows: WeatherWindowInfo[];
}
export declare class PhysicalRealityRetrievalService {
    private readonly chunkRetrievalService?;
    private readonly qualityMonitor?;
    private readonly logger;
    constructor(chunkRetrievalService?: ChunkRetrievalService, qualityMonitor?: PhysicalRealityQualityMonitorService);
    retrievePhysicalRealityData(region: string, options?: {
        lat?: number;
        lng?: number;
        month?: number;
        limit?: number;
    }): Promise<PhysicalRealityData>;
    private buildQueries;
    private retrieveRoadStates;
    private retrieveFerryStates;
    private retrieveWeatherWindows;
    private parseRoadState;
    private parseFerryState;
    private parseWeatherWindow;
    private extractRoadId;
    private extractRoadName;
    private extractRoadStatus;
    private extractSeasonMonths;
    private extractSeasonOpenFrom;
    private extractSeasonOpenTo;
    private extractRequires4x4;
    private extractHazards;
    private extractCoordinates;
    private extractRouteId;
    private extractRouteName;
    private extractFromPort;
    private extractToPort;
    private extractFerryStatus;
    private extractSchedule;
    private extractBooking;
    private extractRegionId;
    private extractRegionName;
    private extractBestWindows;
    private extractRiskLevels;
    private extractExtremeEvents;
}
