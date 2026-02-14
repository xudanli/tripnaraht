export declare enum ValidationSeverity {
    ERROR = "error",
    WARNING = "warning",
    INFO = "info"
}
export declare enum ValidationCode {
    TIME_OVERLAP = "TIME_OVERLAP",
    INSUFFICIENT_TRAVEL_TIME = "INSUFFICIENT_TRAVEL_TIME",
    SHORT_BUFFER = "SHORT_BUFFER",
    BUSINESS_HOURS_VIOLATION = "BUSINESS_HOURS_VIOLATION",
    CASCADE_IMPACT = "CASCADE_IMPACT",
    INVALID_TIME_RANGE = "INVALID_TIME_RANGE",
    NOT_FOUND = "NOT_FOUND"
}
export interface ValidationSuggestion {
    action: 'ADJUST_TIME' | 'CHANGE_TRANSPORT' | 'REORDER' | 'REMOVE' | 'ADD_BUFFER';
    description: string;
    suggestedValue?: {
        startTime?: string;
        endTime?: string;
        transportMode?: string;
    };
    estimatedImprovement?: string;
}
export interface ValidationResult {
    valid: boolean;
    severity: ValidationSeverity;
    code: ValidationCode;
    message: string;
    details: Record<string, any>;
    suggestions?: ValidationSuggestion[];
}
export interface TravelInfo {
    fromPlace?: string;
    toPlace?: string;
    straightDistance: number;
    roadDistance?: number;
    estimatedDuration: number;
    recommendedTransport: 'WALKING' | 'DRIVING' | 'TRANSIT';
    availableTime: number;
}
export interface AggregatedValidationResult {
    canProceed: boolean;
    requiresConfirmation: boolean;
    errors: ValidationResult[];
    warnings: ValidationResult[];
    infos: ValidationResult[];
    travelInfo?: TravelInfo;
}
export interface CascadeImpactItem {
    id: string;
    name: string;
    originalTime: string;
    suggestedTime: string;
    delayMinutes: number;
    originalTimeRange?: {
        start: string;
        end: string;
    };
    adjustedTimeRange?: {
        start: string;
        end: string;
    };
    timeDelta?: string;
}
export interface CascadeImpact {
    affectedCount: number;
    affectedItems: CascadeImpactItem[];
    autoAdjusted: boolean;
    autoAdjust?: boolean;
    adjustmentSummary?: string;
}
export interface ContextItem {
    id: string;
    placeId?: number;
    startTime: Date;
    endTime: Date;
    type: string;
    place?: {
        id: number;
        name: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
    };
}
export interface ValidationContext {
    tripDayId: string;
    tripDayDate: Date;
    newItem: {
        placeId?: number;
        startTime: Date;
        endTime: Date;
        type: string;
    };
    newItemPlace?: {
        id: number;
        name: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
        metadata?: any;
    };
    existingItems: ContextItem[];
    previousItem?: ContextItem;
    nextItem?: ContextItem;
}
export interface IValidator {
    validate(context: ValidationContext): Promise<ValidationResult | null>;
    getCode(): ValidationCode;
    getSeverity(): ValidationSeverity;
}
export interface BatchValidationItem {
    day: string;
    itemIds: string[];
    type: string;
    message: string;
    severity: ValidationSeverity;
}
export interface BatchValidationResult {
    valid: boolean;
    tripId: string;
    errors: BatchValidationItem[];
    warnings: BatchValidationItem[];
    summary: {
        errorCount: number;
        warningCount: number;
        infoCount: number;
    };
}
