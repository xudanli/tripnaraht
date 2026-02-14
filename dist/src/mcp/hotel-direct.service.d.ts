import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export interface HotelSearchParams {
    query?: string;
    location?: {
        lat: number;
        lng: number;
    };
    radius?: number;
    type?: string;
    priceLevel?: 1 | 2 | 3 | 4;
    minRating?: number;
    checkIn?: string;
    checkOut?: string;
    guests?: number;
    language?: string;
}
export interface HotelDetails {
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
    amenities?: string[];
    roomTypes?: string[];
}
export declare class HotelDirectService implements OnModuleInit, OnModuleDestroy {
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
    searchHotels(params: HotelSearchParams): Promise<{
        success: boolean;
        results: HotelDetails[];
        totalResults?: number;
    }>;
    getHotelDetails(placeId: string, language?: string): Promise<HotelDetails | null>;
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
        language?: string;
    }): Promise<HotelDetails[]>;
    getUserPreferences(userId: string): Promise<{
        hotelType: string[];
        priceRange: string;
        amenities: string[];
        favoriteHotels: string[];
    } | null>;
    saveUserPreferences(userId: string, preferences: {
        hotelType?: string[];
        priceRange?: string;
        amenities?: string[];
        favoriteHotels?: string[];
    }): Promise<void>;
    recommendHotels(userId: string, context: {
        location: {
            lat: number;
            lng: number;
        };
        checkIn?: string;
        checkOut?: string;
        guests?: number;
        radius?: number;
    }): Promise<HotelDetails[]>;
    private mapPlaceToHotel;
}
