import { PlaceCategory } from '@prisma/client';
export declare class GetPlacesAdminQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    category?: PlaceCategory;
    cityId?: number;
    countryCode?: string;
}
export declare class PlaceAdminResponseDto {
    id: number;
    uuid: string;
    nameCN: string;
    nameEN?: string | null;
    category: PlaceCategory;
    address?: string | null;
    rating?: number | null;
    googlePlaceId?: string | null;
    location?: {
        lat: number;
        lng: number;
    } | null;
    metadata?: any;
    physicalMetadata?: any;
    city?: {
        id: number;
        name: string;
        nameCN?: string | null;
        nameEN?: string | null;
        countryCode: string;
        timezone?: string | null;
    } | null;
    countryCode?: string | null;
    description?: string | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare class PlaceListAdminResponseDto {
    places: PlaceAdminResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
