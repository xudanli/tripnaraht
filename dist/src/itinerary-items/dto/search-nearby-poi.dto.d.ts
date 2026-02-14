import { PlaceCategory } from '@prisma/client';
export declare enum NearbyPoiCategory {
    ATTRACTION = "ATTRACTION",
    RESTAURANT = "RESTAURANT",
    HOTEL = "HOTEL",
    GAS_STATION = "GAS_STATION",
    REST_AREA = "REST_AREA"
}
export declare class SearchNearbyPoiQueryDto {
    itemId?: string;
    lat?: number;
    lng?: number;
    radius?: number;
    categories?: NearbyPoiCategory[];
    minRating?: number;
    openNow?: boolean;
    limit?: number;
}
export declare class NearbyPoiResultDto {
    id: number;
    nameCN: string;
    nameEN?: string;
    category: PlaceCategory;
    address?: string;
    rating?: number;
    lat: number;
    lng: number;
    distanceMeters: number;
    openingHours?: {
        open?: string;
        close?: string;
        openNow?: boolean;
    };
    metadata?: any;
}
