export declare const VALID_CATEGORIES: readonly ["ATTRACTION", "RESTAURANT", "SHOPPING", "HOTEL", "TRANSIT_HUB", "landmark", "nature", "restaurant", "hotel", "temple", "museum", "park", "beach", "mountain"];
export type ValidCategory = typeof VALID_CATEGORIES[number];
export declare const CATEGORY_MAP: Record<string, string>;
export declare class PlaceImageRequestDto {
    placeId?: string;
    placeName: string;
    placeNameEn?: string;
    country?: string;
    category?: ValidCategory;
}
export declare class BatchPlaceImageRequestDto {
    places: PlaceImageRequestDto[];
}
export declare class UnsplashUrlsDto {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
}
export declare class UnsplashAttributionDto {
    photographerName: string;
    photographerUrl: string;
    unsplashUrl: string;
}
export declare class UnsplashUserDto {
    name: string;
    username: string;
    link: string;
}
export declare class UnsplashPhotoDto {
    id: string;
    width: number;
    height: number;
    color: string;
    blurHash: string;
    description?: string | null;
    altDescription?: string | null;
    urls: UnsplashUrlsDto;
    user: UnsplashUserDto;
    attribution: UnsplashAttributionDto;
}
export declare class PlaceImageResultDto {
    placeId?: string;
    placeName: string;
    photo: UnsplashPhotoDto | null;
    cached: boolean;
    error?: string;
}
export declare class BatchStatsDto {
    total: number;
    found: number;
    cached: number;
    failed: number;
}
export declare class BatchPlaceImageResponseDto {
    success: boolean;
    results: PlaceImageResultDto[];
    stats: BatchStatsDto;
    processingTimeMs: number;
}
export declare class SavePlaceImageRequestDto {
    placeId: number;
    photo: UnsplashPhotoDto;
    isPrimary?: boolean;
}
export declare class SavePlaceImageResponseDto {
    success: boolean;
    placeId: number;
    placeName: string;
    savedImage: {
        url: string;
        caption: string;
        source: string;
        isPrimary: boolean;
        savedAt: string;
        attribution: UnsplashAttributionDto;
    };
    totalImages: number;
}
