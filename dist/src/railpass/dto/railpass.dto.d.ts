import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';
export declare class CheckEligibilityDto {
    residencyCountry: string;
    travelCountries: string[];
    isCrossResidencyCountry?: boolean;
    departureDate: string;
}
export declare class RecommendPassDto {
    residencyCountry: string;
    travelCountries: string[];
    estimatedRailSegments: number;
    crossCountryCount: number;
    isDailyTravel: boolean;
    stayMode: 'city_hopping' | 'stay_extended';
    budgetSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    tripDurationDays: number;
    tripDateRange: {
        start: string;
        end: string;
    };
    passFamily: 'EURAIL' | 'INTERRAIL';
    preferences?: {
        preferFlexibility?: boolean;
        preferMobile?: boolean;
        preferFirstClass?: boolean;
    };
    sampleSegments?: RailSegment[];
}
export declare class CheckReservationDto {
    segment: RailSegment;
}
export declare class PlanReservationsDto {
    segments: RailSegment[];
    userPreferences?: {
        maxReservationFee?: number;
        preferNoReservation?: boolean;
    };
}
export declare class SimulateTravelDaysDto {
    segments: RailSegment[];
    passProfile: RailPassProfile;
}
export declare class ValidateComplianceDto {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    reservationTasks?: ReservationTask[];
}
export declare class UpdateTripRailPassProfileDto {
    tripId: string;
    railPassProfile: RailPassProfile;
}
export declare class UpdateReservationTaskDto {
    taskId: string;
    status: 'NEEDED' | 'PLANNED' | 'BOOKED' | 'FAILED' | 'FALLBACK_APPLIED';
    bookingRef?: string;
    cost?: number;
    failReason?: string;
    fallbackPlanId?: string;
}
