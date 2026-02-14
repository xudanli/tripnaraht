import { PlaceCategory } from '@prisma/client';
export interface BasePlaceResponse {
    id: number;
    uuid: string;
    nameCN: string;
    nameEN?: string | null;
    category: PlaceCategory;
    address?: string | null;
    rating?: number | null;
    googlePlaceId?: string | null;
    description?: string | null;
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
    createdAt?: Date;
    updatedAt?: Date;
}
export interface PlaceWithDistanceResponse extends BasePlaceResponse {
    distance: number;
    isOpen?: boolean;
    tags?: string[];
    status?: {
        isOpen: boolean;
        text: string;
        hoursToday: string;
    };
}
export interface PlaceListResponse {
    places: BasePlaceResponse[];
    total: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    hasPrev?: boolean;
    hasNext?: boolean;
}
