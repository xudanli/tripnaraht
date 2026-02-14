import { ValidationCode, ValidationSeverity } from '../interfaces/validation.interface';
export declare class ValidationSuggestionDto {
    action: string;
    description: string;
    suggestedValue?: {
        startTime?: string;
        endTime?: string;
        transportMode?: string;
    };
    estimatedImprovement?: string;
}
export declare class ValidationResultDto {
    valid: boolean;
    severity: ValidationSeverity;
    code: ValidationCode;
    message: string;
    details: Record<string, any>;
    suggestions?: ValidationSuggestionDto[];
}
export declare class TravelInfoDto {
    fromPlace?: string;
    toPlace?: string;
    straightDistance: number;
    roadDistance?: number;
    estimatedDuration: number;
    recommendedTransport: string;
    availableTime: number;
}
export declare class AggregatedValidationResultDto {
    canProceed: boolean;
    requiresConfirmation: boolean;
    errors: ValidationResultDto[];
    warnings: ValidationResultDto[];
    infos: ValidationResultDto[];
    travelInfo?: TravelInfoDto;
}
export declare class TimeRangeDto {
    start: string;
    end: string;
}
export declare class CascadeImpactItemDto {
    id: string;
    name: string;
    originalTime: string;
    suggestedTime: string;
    delayMinutes: number;
    originalTimeRange?: TimeRangeDto;
    adjustedTimeRange?: TimeRangeDto;
    timeDelta?: string;
}
export declare class CascadeImpactDto {
    affectedCount: number;
    affectedItems: CascadeImpactItemDto[];
    autoAdjusted: boolean;
    autoAdjust?: boolean;
    adjustmentSummary?: string;
}
export declare class BatchValidationItemDto {
    day: string;
    itemIds: string[];
    type: string;
    message: string;
    severity: ValidationSeverity;
}
export declare class BatchValidationResultDto {
    valid: boolean;
    tripId: string;
    errors: BatchValidationItemDto[];
    warnings: BatchValidationItemDto[];
    summary: {
        errorCount: number;
        warningCount: number;
        infoCount: number;
    };
}
