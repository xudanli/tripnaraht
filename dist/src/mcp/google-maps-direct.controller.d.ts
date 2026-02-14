import { GoogleMapsDirectService } from './google-maps-direct.service';
export declare class GoogleMapsDirectController {
    private readonly googleMapsService;
    constructor(googleMapsService: GoogleMapsDirectService);
    health(): Promise<{
        success: boolean;
        available: boolean;
    }>;
    getRoute(body: {
        origin: string;
        destination: string;
        mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
        waypoints?: string[];
        avoid?: ('tolls' | 'highways' | 'ferries')[];
        alternatives?: boolean;
        language?: string;
        units?: 'metric' | 'imperial';
    }): Promise<any>;
    computeDistanceMatrix(body: {
        origins: string[];
        destinations: string[];
        mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
        language?: string;
        units?: 'metric' | 'imperial';
        avoid?: ('tolls' | 'highways' | 'ferries')[];
    }): Promise<any>;
    geocode(body: {
        address?: string;
        latlng?: {
            lat: number;
            lng: number;
        };
        language?: string;
        region?: string;
    }): Promise<any>;
    searchPlaces(body: {
        query: string;
        location?: {
            lat: number;
            lng: number;
        };
        radius?: number;
        language?: string;
        type?: string;
    }): Promise<any>;
    nearbySearch(body: {
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
