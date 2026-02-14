export declare class MarkNotApplicableDto {
    reason?: string;
}
export declare class MarkNotApplicableResponseDto {
    findingId: string;
    marked: boolean;
    reason?: string;
    markedAt: string;
}
export declare class AddToLaterDto {
    reminderDate?: string;
    note?: string;
}
export declare class AddToLaterResponseDto {
    findingId: string;
    added: boolean;
    reminderDate?: string;
    note?: string;
    addedAt: string;
}
export declare class NotApplicableItemDto {
    findingId: string;
    reason?: string;
    markedAt: string;
}
export declare class LaterItemDto {
    findingId: string;
    reminderDate?: string;
    note?: string;
    addedAt: string;
}
export declare class GetNotApplicableResponseDto {
    notApplicableItems: NotApplicableItemDto[];
}
export declare class GetLaterResponseDto {
    laterItems: LaterItemDto[];
}
