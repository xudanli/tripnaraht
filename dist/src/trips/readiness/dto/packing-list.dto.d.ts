export declare class CustomPackingItemDto {
    name: string;
    category: string;
    quantity?: number;
    note?: string;
}
export declare class GeneratePackingListDto {
    includeOptional?: boolean;
    categories?: string[];
    customItems?: CustomPackingItemDto[];
    season?: 'summer' | 'transition' | 'winter';
    route?: string;
    userType?: string;
    activities?: string[];
    vehicleType?: string;
    specialNeeds?: string[];
    useTemplate?: boolean;
}
export declare class PackingListItemDto {
    id: string;
    name: string;
    category: 'clothing' | 'gear' | 'documents' | 'electronics' | 'food' | 'medical' | 'other';
    quantity: number;
    unit?: string;
    priority: 'must' | 'should' | 'optional';
    reason?: string;
    sourceFindingId?: string;
    checked: boolean;
    note?: string;
}
export declare class PackingListSummaryDto {
    totalItems: number;
    byCategory?: Record<string, number>;
    checkedItems?: number;
}
export declare class GeneratePackingListResponseDto {
    tripId: string;
    generatedAt: string;
    items: PackingListItemDto[];
    summary: PackingListSummaryDto;
}
export declare class GetPackingListResponseDto {
    tripId: string;
    items: PackingListItemDto[];
    summary: PackingListSummaryDto;
    lastGeneratedAt?: string;
}
export declare class UpdatePackingListItemDto {
    checked?: boolean;
    quantity?: number;
    note?: string;
}
export declare class UpdatePackingListItemResponseDto {
    itemId: string;
    updated: boolean;
}
