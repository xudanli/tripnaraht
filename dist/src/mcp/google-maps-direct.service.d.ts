import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class GoogleMapsDirectService implements OnModuleInit, OnModuleDestroy {
    private configService?;
    private readonly logger;
    private axiosInstance;
    private apiKey;
    private isAvailable;
    private readonly baseUrl;
    constructor(configService?: ConfigService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    getTrafficStatus(params: {
        roadId: string;
        location: {
            lat: number;
            lng: number;
        };
        radius?: number;
    }): Promise<{
        status: 'OPEN' | 'CLOSED' | 'CONDITIONAL' | 'SLOW' | 'MODERATE';
        severity: 'LOW' | 'MEDIUM' | 'HIGH';
        description?: string;
        confidence: number;
    } | null>;
    isServiceAvailable(): boolean;
    getRoute(params: {
        origin: string;
        destination: string;
        mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
        waypoints?: string[];
        avoid?: ('tolls' | 'highways' | 'ferries')[];
        alternatives?: boolean;
        language?: string;
        units?: 'metric' | 'imperial';
    }): Promise<any>;
    computeDistanceMatrix(params: {
        origins: string[];
        destinations: string[];
        mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
        language?: string;
        units?: 'metric' | 'imperial';
        avoid?: ('tolls' | 'highways' | 'ferries')[];
        departureTime?: Date;
        arrivalTime?: Date;
    }): Promise<any>;
    geocode(params: {
        address?: string;
        latlng?: {
            lat: number;
            lng: number;
        };
        language?: string;
        region?: string;
    }): Promise<any>;
    searchPlaces(params: {
        query: string;
        location?: {
            lat: number;
            lng: number;
        };
        radius?: number;
        language?: string;
        type?: string;
    }): Promise<any>;
    nearbySearch(params: {
        location: {
            lat: number;
            lng: number;
        };
        radius?: number;
        type?: string;
        keyword?: string;
        language?: string;
    }): Promise<any>;
}
