import { ReadinessPack } from '../types/readiness-pack.types';
export declare class GetReadinessPacksQueryDto {
    page?: number;
    limit?: number;
    countryCode?: string;
    destinationId?: string;
    isActive?: boolean;
    search?: string;
}
export declare class ReadinessPackListItemDto {
    id: string;
    packId: string;
    destinationId: string;
    displayName: string;
    displayNameEN?: string;
    displayNameCN?: string;
    version: string;
    lastReviewedAt: Date;
    countryCode: string;
    region?: string;
    regionEN?: string;
    regionCN?: string;
    city?: string;
    cityEN?: string;
    cityCN?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare class ReadinessPackListResponseDto {
    packs: ReadinessPackListItemDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export declare class CreateReadinessPackDto {
    pack: ReadinessPack;
}
export declare class UpdateReadinessPackDto {
    pack?: ReadinessPack;
    isActive?: boolean;
}
