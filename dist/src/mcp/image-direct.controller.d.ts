import { ImageDirectService, ImageSearchParams } from './image-direct.service';
export declare class ImageDirectController {
    private readonly imageService;
    constructor(imageService: ImageDirectService);
    health(): Promise<{
        success: boolean;
        available: boolean;
    }>;
    searchImages(body: ImageSearchParams): Promise<{
        page: number;
        perPage: number;
        totalResults: number;
        totalPages: number;
        photos: import("./image-direct.service").ImageDetails[];
        success: boolean;
    }>;
    getImageDetails(photoId: string, source?: 'pexels' | 'unsplash'): Promise<{
        success: boolean;
        photo: import("./image-direct.service").ImageDetails;
    }>;
    getCuratedPhotos(perPage?: number, page?: number): Promise<{
        page: number;
        perPage: number;
        totalResults: number;
        totalPages: number;
        photos: import("./image-direct.service").ImageDetails[];
        success: boolean;
    }>;
    getUserImagePreferences(user: any): Promise<{
        success: boolean;
        preferences: {
            preferredStyles: string[];
            preferredColors: string[];
            preferredOrientations: string[];
            favoriteImages: number[];
        };
    }>;
    saveUserImagePreferences(user: any, body: {
        preferredStyles?: string[];
        preferredColors?: string[];
        preferredOrientations?: string[];
        favoriteImages?: number[];
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    recommendImages(user: any, body: {
        query?: string;
        perPage?: number;
        page?: number;
    }): Promise<{
        page: number;
        perPage: number;
        totalResults: number;
        totalPages: number;
        photos: import("./image-direct.service").ImageDetails[];
        success: boolean;
    }>;
}
