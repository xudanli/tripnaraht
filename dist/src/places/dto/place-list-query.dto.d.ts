import { PlaceCategory } from '@prisma/client';
export declare enum PaginationDirection {
    NEXT = "next",
    PREV = "prev"
}
export declare class PlaceListQueryDto {
    page?: number;
    limit?: number;
    category?: PlaceCategory;
    cityId?: number;
    orderBy?: 'id' | 'rating' | 'createdAt' | 'updatedAt';
    orderDirection?: 'asc' | 'desc';
}
export declare class PlaceListResponseDto {
    places: any[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
}
