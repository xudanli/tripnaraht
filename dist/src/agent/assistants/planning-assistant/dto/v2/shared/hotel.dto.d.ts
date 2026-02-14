export declare class HotelLocationDto {
    lat: number;
    lng: number;
}
export declare class HotelPhotoDto {
    photoReference: string;
    width: number;
    height: number;
}
export declare class HotelReviewDto {
    authorName: string;
    rating: number;
    text: string;
    time: number;
}
export declare class HotelOpeningHoursDto {
    openNow: boolean;
    weekdayText?: string[];
}
export declare class HotelDto {
    placeId: string;
    name: string;
    address: string;
    location: HotelLocationDto;
    rating?: number;
    userRatingsTotal?: number;
    priceLevel?: number;
    types?: string[];
    openingHours?: HotelOpeningHoursDto;
    photos?: HotelPhotoDto[];
    phoneNumber?: string;
    website?: string;
    reviews?: HotelReviewDto[];
    amenities?: string[];
    roomTypes?: string[];
}
