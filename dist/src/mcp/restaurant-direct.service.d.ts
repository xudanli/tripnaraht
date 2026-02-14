import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export interface RestaurantSearchParams {
    query?: string;
    location?: {
        lat: number;
        lng: number;
    };
    radius?: number;
    type?: string;
    priceLevel?: 1 | 2 | 3 | 4;
    minRating?: number;
    openNow?: boolean;
    language?: string;
}
export interface RestaurantDetails {
    placeId: string;
    name: string;
    address: string;
    location: {
        lat: number;
        lng: number;
    };
    rating?: number;
    userRatingsTotal?: number;
    priceLevel?: number;
    types?: string[];
    openingHours?: {
        openNow: boolean;
        weekdayText?: string[];
    };
    photos?: Array<{
        photoReference: string;
        width: number;
        height: number;
    }>;
    phoneNumber?: string;
    website?: string;
    reviews?: Array<{
        authorName: string;
        rating: number;
        text: string;
        time: number;
    }>;
    cuisine?: string[];
    dietaryRestrictions?: string[];
}
export declare class RestaurantDirectService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly prisma;
    private readonly logger;
    private axiosInstance;
    private apiKey;
    private isAvailable;
    private readonly baseUrl;
    constructor(configService: ConfigService, prisma: PrismaService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    isServiceAvailable(): boolean;
    searchRestaurants(params: RestaurantSearchParams): Promise<{
        success: boolean;
        results: RestaurantDetails[];
        totalResults?: number;
    }>;
    getRestaurantDetails(placeId: string, language?: string): Promise<RestaurantDetails | null>;
    nearbySearch(params: {
        location: {
            lat: number;
            lng: number;
        };
        radius?: number;
        type?: string;
        keyword?: string;
        priceLevel?: 1 | 2 | 3 | 4;
        minRating?: number;
        openNow?: boolean;
        language?: string;
    }): Promise<RestaurantDetails[]>;
    getUserPreferences(userId: string): Promise<{
        cuisine: string[];
        priceRange: string;
        dietaryRestrictions: string[];
        favoriteRestaurants: string[];
    } | null>;
    saveUserPreferences(userId: string, preferences: {
        cuisine?: string[];
        priceRange?: string;
        dietaryRestrictions?: string[];
        favoriteRestaurants?: string[];
    }): Promise<void>;
    recommendRestaurants(userId: string, context: {
        location: {
            lat: number;
            lng: number;
        };
        time?: Date;
        budget?: number;
        radius?: number;
    }): Promise<RestaurantDetails[]>;
    private mapPlaceToRestaurant;
}
