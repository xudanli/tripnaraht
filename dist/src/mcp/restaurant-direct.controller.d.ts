import { RestaurantDirectService, RestaurantSearchParams } from './restaurant-direct.service';
export declare class RestaurantDirectController {
    private readonly restaurantService;
    constructor(restaurantService: RestaurantDirectService);
    health(): Promise<{
        success: boolean;
        available: boolean;
    }>;
    searchRestaurants(user: any, body: RestaurantSearchParams): Promise<{
        success: boolean;
        results: import("./restaurant-direct.service").RestaurantDetails[];
        totalResults?: number;
    }>;
    getRestaurantDetails(placeId: string, language?: string): Promise<{
        success: boolean;
        restaurant: import("./restaurant-direct.service").RestaurantDetails;
    }>;
    nearbySearch(lat: string, lng: string, radius?: string, type?: string, keyword?: string, priceLevel?: string, minRating?: string, openNow?: string, language?: string): Promise<{
        success: boolean;
        results: import("./restaurant-direct.service").RestaurantDetails[];
        count: number;
    }>;
    getUserPreferences(user: any): Promise<{
        success: boolean;
        preferences: {
            cuisine: string[];
            priceRange: string;
            dietaryRestrictions: string[];
            favoriteRestaurants: string[];
        };
    }>;
    saveUserPreferences(user: any, body: {
        cuisine?: string[];
        priceRange?: string;
        dietaryRestrictions?: string[];
        favoriteRestaurants?: string[];
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    recommendRestaurants(user: any, body: {
        location: {
            lat: number;
            lng: number;
        };
        time?: string;
        budget?: number;
        radius?: number;
    }): Promise<{
        success: boolean;
        recommendations: import("./restaurant-direct.service").RestaurantDetails[];
        count: number;
    }>;
}
