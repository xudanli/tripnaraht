import { PlaceCategory } from '@prisma/client';
export declare class UpdatePlaceDto {
    nameCN?: string;
    nameEN?: string;
    category?: PlaceCategory;
    address?: string;
    lat?: number;
    lng?: number;
    cityId?: number;
    googlePlaceId?: string;
    rating?: number;
    metadata?: any;
    physicalMetadata?: any;
    description?: string;
}
