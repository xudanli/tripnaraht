import { HotelDirectService, HotelSearchParams } from './hotel-direct.service';
export declare class HotelDirectController {
    private readonly hotelService;
    constructor(hotelService: HotelDirectService);
    health(): Promise<{
        success: boolean;
        available: boolean;
    }>;
    searchHotels(user: any, body: HotelSearchParams): Promise<{
        success: boolean;
        results: import("./hotel-direct.service").HotelDetails[];
        totalResults?: number;
    }>;
    getHotelDetails(placeId: string, language?: string): Promise<{
        success: boolean;
        hotel: import("./hotel-direct.service").HotelDetails;
    }>;
    nearbySearch(lat: string, lng: string, radius?: string, type?: string, keyword?: string, priceLevel?: string, minRating?: string, language?: string): Promise<{
        success: boolean;
        results: import("./hotel-direct.service").HotelDetails[];
        count: number;
    }>;
    getUserPreferences(user: any): Promise<{
        success: boolean;
        preferences: {
            hotelType: string[];
            priceRange: string;
            amenities: string[];
            favoriteHotels: string[];
        };
    }>;
    saveUserPreferences(user: any, body: {
        hotelType?: string[];
        priceRange?: string;
        amenities?: string[];
        favoriteHotels?: string[];
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    recommendHotels(user: any, body: {
        location: {
            lat: number;
            lng: number;
        };
        checkIn?: string;
        checkOut?: string;
        guests?: number;
        radius?: number;
    }): Promise<{
        success: boolean;
        recommendations: import("./hotel-direct.service").HotelDetails[];
        count: number;
    }>;
}
