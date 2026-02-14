export declare enum ConflictType {
    TIME_CONFLICT = "TIME_CONFLICT",
    LUNCH_WINDOW = "LUNCH_WINDOW",
    FATIGUE_EXCEEDED = "FATIGUE_EXCEEDED",
    BUFFER_INSUFFICIENT = "BUFFER_INSUFFICIENT",
    CLOSURE_RISK = "CLOSURE_RISK",
    ACCESSIBILITY_MISMATCH = "ACCESSIBILITY_MISMATCH",
    TRANSPORT_TOO_LONG = "TRANSPORT_TOO_LONG"
}
export declare enum ConflictSeverity {
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW"
}
export declare class ConflictSuggestionDto {
    action: string;
    description: string;
    impact: string;
}
export declare class ConflictDto {
    id: string;
    type: ConflictType;
    severity: ConflictSeverity;
    title: string;
    description: string;
    affectedDays: string[];
    affectedItemIds: string[];
    suggestions?: ConflictSuggestionDto[];
}
export declare class ConflictsResponseDto {
    tripId: string;
    conflicts: ConflictDto[];
    total: number;
}
