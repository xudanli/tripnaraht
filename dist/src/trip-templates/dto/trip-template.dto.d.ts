export declare enum TripTemplateTheme {
    FAMILY = "FAMILY",
    BACKPACKER = "BACKPACKER",
    LEISURE = "LEISURE",
    BUSINESS = "BUSINESS",
    HONEYMOON = "HONEYMOON",
    ADVENTURE = "ADVENTURE"
}
export declare class GetTripTemplatesQueryDto {
    theme?: TripTemplateTheme;
    destination?: string;
    isPublic?: boolean;
}
export declare class TripTemplateResponseDto {
    id: string;
    name: string;
    nameCN?: string;
    description?: string;
    theme: string;
    destination?: string;
    config: Record<string, any>;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare class CreateTripFromTemplateDto {
    templateId: string;
    destination: string;
    startDate: string;
    endDate: string;
    totalBudget?: number;
    overrideConfig?: Record<string, any>;
}
