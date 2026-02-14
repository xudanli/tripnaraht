import { TripStatus } from './trip-status.dto';
export declare enum TripPace {
    RELAXED = "relaxed",
    STANDARD = "standard",
    TIGHT = "tight"
}
export declare enum MobilityTag {
    IRON_LEGS = "IRON_LEGS",
    ACTIVE_SENIOR = "ACTIVE_SENIOR",
    CITY_POTATO = "CITY_POTATO",
    LIMITED = "LIMITED"
}
export declare class TravelerDto {
    type: 'ADULT' | 'ELDERLY' | 'CHILD';
    mobilityTag: MobilityTag;
}
export declare class CreateTripDto {
    destination: string;
    startDate: string;
    endDate: string;
    totalBudget: number;
    travelers: TravelerDto[];
    status?: TripStatus;
    pace?: TripPace;
    preferences?: string[];
    mustPlaces?: number[];
    avoidPlaces?: number[];
    name?: string;
}
