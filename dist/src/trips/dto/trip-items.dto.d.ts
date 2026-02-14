export declare class BatchUpdateItemDto {
    itemId: string;
    startTime?: string;
    endTime?: string;
    placeId?: number;
    note?: string;
}
export declare class BatchUpdateItemsRequestDto {
    updates: BatchUpdateItemDto[];
}
export declare class BatchUpdateItemsResponseDto {
    success: boolean;
    updatedCount: number;
    failedCount: number;
    errors?: Array<{
        itemId: string;
        error: string;
    }>;
}
