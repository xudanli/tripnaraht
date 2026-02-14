import { PlaceCategory } from '@prisma/client';
import { PlaceMetadata } from '../interfaces/place-metadata.interface';
export declare class CreatePlaceDto {
    nameCN: string;
    nameEN?: string;
    category: PlaceCategory;
    lat: number;
    lng: number;
    address?: string;
    cityId: number;
    metadata?: PlaceMetadata;
    googlePlaceId?: string | null;
    rating?: number;
    description?: string;
}
