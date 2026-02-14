import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export interface UnsplashPhoto {
    id: string;
    width: number;
    height: number;
    color: string;
    blurHash: string;
    description: string | null;
    altDescription: string | null;
    urls: {
        raw: string;
        full: string;
        regular: string;
        small: string;
        thumb: string;
    };
    links: {
        html: string;
        download: string;
    };
    user: {
        name: string;
        username: string;
        link: string;
    };
    attribution: {
        photographerName: string;
        photographerUrl: string;
        unsplashUrl: string;
    };
}
export interface PlaceImageRequest {
    placeId?: string;
    placeName: string;
    placeNameEn?: string;
    country?: string;
    category?: string;
}
export interface PlaceImageResult {
    placeId?: string;
    placeName: string;
    photo: UnsplashPhoto | null;
    cached: boolean;
    error?: string;
}
export interface BatchImageResponse {
    success: boolean;
    results: PlaceImageResult[];
    stats: {
        total: number;
        found: number;
        cached: number;
        failed: number;
    };
    processingTimeMs: number;
}
export declare class UnsplashService implements OnModuleInit {
    private readonly configService?;
    private readonly logger;
    private accessKey;
    private readonly baseUrl;
    private httpClient;
    private cache;
    private readonly CACHE_TTL_MS;
    private requestCount;
    private readonly MAX_REQUESTS_PER_HOUR;
    private lastResetTime;
    constructor(configService?: ConfigService);
    private initHttpClient;
    onModuleInit(): void;
    getBatchPlaceImages(places: PlaceImageRequest[]): Promise<BatchImageResponse>;
    getPlaceImage(place: PlaceImageRequest): Promise<PlaceImageResult>;
    private searchPhoto;
    private trySearch;
    private normalizePlaceName;
    private getCountryName;
    private buildSearchQuery;
    private transformPhoto;
    private buildCacheKey;
    private getFromCache;
    private setCache;
    private checkRateLimit;
    private delay;
    getCacheStats(): {
        size: number;
        ttlMs: number;
    };
    clearCache(): void;
}
