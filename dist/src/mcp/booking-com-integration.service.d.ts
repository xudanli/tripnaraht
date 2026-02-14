import { BookingComService } from './booking-com.service';
import { RedisService } from '../redis/redis.service';
import { BookingComMonitoringService } from './booking-com-monitoring.service';
import { RoutePlanDraft, WorldModelContext } from '../trips/decision/shared/world-model.types';
export interface CarRentalAvailability {
    available: boolean;
    rentalsCount: number;
    rentals: Array<{
        id: string;
        company: string;
        vehicleType: string;
        price: {
            amount: number;
            currency: string;
        };
        pickupLocation: {
            lat: number;
            lng: number;
            address?: string;
        };
        dropoffLocation: {
            lat: number;
            lng: number;
            address?: string;
        };
        pickupTime: string;
        dropoffTime: string;
        distanceFromPoint?: number;
    }>;
    source: 'BOOKING_COM';
}
export interface CarRentalPaceImpact {
    impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    distanceToPickupLocation: number;
    distanceToDropoffLocation: number;
    explanation: string;
}
export declare class BookingComIntegrationService {
    private readonly bookingComService?;
    private readonly redisService?;
    private readonly monitoring?;
    private readonly logger;
    constructor(bookingComService?: BookingComService, redisService?: RedisService, monitoring?: BookingComMonitoringService);
    checkCriticalNodeCarRentalAvailability(pickupLocation: {
        lat: number;
        lng: number;
    }, dropoffLocation: {
        lat: number;
        lng: number;
    }, pickupTime: string, dropoffTime: string, driverAge: number): Promise<CarRentalAvailability>;
    checkCarRentalImpactOnPace(pickupLocation: {
        lat: number;
        lng: number;
    }, dropoffLocation: {
        lat: number;
        lng: number;
    }, pickupTime: string, dropoffTime: string, driverAge: number): Promise<CarRentalPaceImpact>;
    searchCarRentalsInCorridor(centerPoint: {
        lat: number;
        lng: number;
    }, radiusKm: number, pickupTime: string, dropoffTime: string, driverAge: number): Promise<CarRentalAvailability>;
    estimateCarRentalCost(plan: RoutePlanDraft, world: WorldModelContext): Promise<{
        totalCost: number;
        currency: string;
        costPerDay: number;
        days: number;
        breakdown: Array<{
            dayIndex: number;
            date: string;
            cost: number;
            rentalCompany?: string;
        }>;
    }>;
    private calculateDistance;
    private toRadians;
}
