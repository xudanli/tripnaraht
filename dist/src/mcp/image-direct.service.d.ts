import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export interface ImageSearchParams {
    query: string;
    perPage?: number;
    page?: number;
    orientation?: 'landscape' | 'portrait' | 'square';
    size?: 'large' | 'medium' | 'small';
    color?: string;
    locale?: string;
}
export interface ImageDetails {
    id: number;
    width: number;
    height: number;
    url: string;
    photographer: string;
    photographerUrl: string;
    photographerId: number;
    avgColor: string;
    src: {
        original: string;
        large2x: string;
        large: string;
        medium: string;
        small: string;
        portrait: string;
        landscape: string;
        tiny: string;
    };
    liked: boolean;
    alt: string;
}
export interface ImageSearchResult {
    page: number;
    perPage: number;
    totalResults: number;
    totalPages: number;
    photos: ImageDetails[];
}
export declare class ImageDirectService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly prisma;
    private readonly logger;
    private axiosInstance;
    private pexelsApiKey;
    private unsplashApiKey;
    private isAvailable;
    private readonly pexelsBaseUrl;
    private readonly unsplashBaseUrl;
    constructor(configService: ConfigService, prisma: PrismaService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    isServiceAvailable(): boolean;
    searchImages(params: ImageSearchParams): Promise<ImageSearchResult>;
    private searchWithPexels;
    private searchWithUnsplash;
    getImageDetails(photoId: number, source?: 'pexels' | 'unsplash'): Promise<ImageDetails | null>;
    getCuratedPhotos(params?: {
        perPage?: number;
        page?: number;
    }): Promise<ImageSearchResult>;
    getUserImagePreferences(userId: string): Promise<{
        preferredStyles: string[];
        preferredColors: string[];
        preferredOrientations: string[];
        favoriteImages: number[];
    } | null>;
    saveUserImagePreferences(userId: string, preferences: {
        preferredStyles?: string[];
        preferredColors?: string[];
        preferredOrientations?: string[];
        favoriteImages?: number[];
    }): Promise<void>;
    recommendImages(userId: string, context: {
        query?: string;
        perPage?: number;
        page?: number;
    }): Promise<ImageSearchResult>;
    private mapPexelsPhotoToImageDetails;
    private mapUnsplashPhotoToImageDetails;
}
