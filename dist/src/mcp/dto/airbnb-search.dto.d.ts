export declare class AirbnbSearchDto {
    location: string;
    adults?: number;
    children?: number;
    infants?: number;
    pets?: number;
    checkin?: string;
    checkout?: string;
    page?: number;
    ignoreRobotsText?: boolean;
}
export declare class AirbnbListingDetailsDto {
    listingId: string;
    checkin?: string;
    checkout?: string;
    adults?: number;
    children?: number;
    infants?: number;
    pets?: number;
    ignoreRobotsText?: boolean;
}
