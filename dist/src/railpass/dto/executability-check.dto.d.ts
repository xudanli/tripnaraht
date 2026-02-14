import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';
export declare class CheckExecutabilityDto {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    reservationTasks?: ReservationTask[];
    placeNames?: Record<number, {
        name: string;
        countryCode: string;
    }>;
}
export declare class RegeneratePlanDto {
    tripId: string;
    strategy: 'MORE_STABLE' | 'MORE_ECONOMICAL' | 'MORE_AFFORDABLE' | 'CUSTOM';
    customParams?: {
        avoidMandatoryReservations?: boolean;
        minimizeTravelDays?: boolean;
        maxReservationFee?: number;
    };
}
