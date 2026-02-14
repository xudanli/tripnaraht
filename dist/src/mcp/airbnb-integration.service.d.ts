import { AirbnbService } from './airbnb.service';
import { RedisService } from '../redis/redis.service';
import { AirbnbMonitoringService } from './airbnb-monitoring.service';
import { RoutePlanDraft, WorldModelContext } from '../trips/decision/shared/world-model.types';
export interface AccommodationAvailability {
    available: boolean;
    listingsCount: number;
    listings?: Array<{
        id: string;
        name: string;
        location: {
            lat: number;
            lng: number;
        };
        price?: {
            amount: number;
            currency: string;
        };
        distanceFromPoint?: number;
    }>;
    source?: string;
}
export interface AccommodationSearchParams {
    location: string | {
        lat: number;
        lng: number;
    };
    checkin: string;
    checkout: string;
    adults: number;
    children?: number;
    infants?: number;
    pets?: number;
}
export declare class AirbnbIntegrationService {
    private readonly airbnbService?;
    private readonly redisService?;
    private readonly monitoring?;
    private readonly logger;
    constructor(airbnbService?: AirbnbService, redisService?: RedisService, monitoring?: AirbnbMonitoringService);
    checkCriticalNodeAvailability(location: {
        lat: number;
        lng: number;
    } | string, checkin: string, checkout: string, partySize: number): Promise<AccommodationAvailability>;
    searchAccommodationsInCorridor(centerPoint: {
        lat: number;
        lng: number;
    }, radiusKm: number, checkin: string, checkout: string, partySize: number): Promise<AccommodationAvailability>;
    checkAccommodationImpactOnPace(routeEndPoint: {
        lat: number;
        lng: number;
    }, checkin: string, checkout: string, partySize: number): Promise<{
        distanceToNearestAccommodation: number;
        nearestAccommodation?: {
            id: string;
            name: string;
            location: {
                lat: number;
                lng: number;
            };
            distance: number;
        };
        impact: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
    private calculateDistance;
    private toRad;
    estimateAccommodationCost(plan: RoutePlanDraft, world: WorldModelContext): Promise<{
        totalCost: number;
        currency: string;
        costPerNight: number;
        nights: number;
        breakdown: Array<{
            dayIndex: number;
            date: string;
            cost: number;
            accommodationName?: string;
        }>;
    }>;
    searchAccommodationsWithPreferences(location: {
        lat: number;
        lng: number;
    } | string, checkin: string, checkout: string, partySize: number, preferences?: {
        pets?: number;
        accessibility?: boolean;
        kitchen?: boolean;
        wifi?: boolean;
    }): Promise<AccommodationAvailability>;
    validateAccommodationInCorridor(accommodationLocation: {
        lat: number;
        lng: number;
    }, routeCorridorGeom: any, bufferMeters?: number): Promise<{
        valid: boolean;
        distanceToCorridor?: number;
        explanation?: string;
    }>;
    private extractPriceAmount;
}
