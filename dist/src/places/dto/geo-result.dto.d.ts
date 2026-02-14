import { PlaceCategory } from '@prisma/client';
export interface RawPlaceResult {
    id: number;
    nameCN: string;
    nameEN: string | null;
    metadata: any;
    distance_meters: number;
    category: PlaceCategory;
    address?: string;
    rating?: number;
}
export interface PlaceWithDistance {
    id: number;
    name: string;
    nameCN: string;
    nameEN: string | null;
    category: PlaceCategory;
    distance: number;
    isOpen: boolean;
    tags: string[];
    address?: string;
    rating?: number;
    status?: {
        isOpen: boolean;
        text: string;
        hoursToday: string;
    };
}
