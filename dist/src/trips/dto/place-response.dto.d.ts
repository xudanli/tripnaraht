export declare class PlaceMetadataResponseDto {
    openingHours?: Record<string, string>;
    price?: number;
    priceLevel?: number;
    tags?: string[];
    phone?: string;
    website?: string;
    business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'UNKNOWN';
}
export declare class PlaceResponseDto {
    id: number;
    nameCN: string;
    nameEN: string | null;
    category: string;
    address: string;
    rating: number | null;
    metadata?: PlaceMetadataResponseDto;
    description?: string | null;
}
export declare function toPlaceResponseDto(place: any): PlaceResponseDto | null;
