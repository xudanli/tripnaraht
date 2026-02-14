export declare enum FindingType {
    WARNING = "warning",
    SUGGESTION = "suggestion",
    POSITIVE = "positive"
}
export declare enum ReadinessStatus {
    PASS = "pass",
    WARN = "warn",
    BLOCK = "block"
}
export declare enum OverallStatus {
    GOOD = "good",
    NEEDS_ATTENTION = "needs_attention",
    HAS_ISSUES = "has_issues"
}
export declare class TripSummaryDto {
    destination: string;
    days: number;
    placesCount: number;
    startDate: string;
    endDate: string;
}
export declare class FindingDto {
    type: FindingType;
    icon: string;
    title: string;
    message: string;
    actionLabel?: string | null;
    actionPrompt?: string | null;
}
export declare class ReadinessSummaryDto {
    status: ReadinessStatus;
    blockers: number;
    must: number;
    should: number;
    warnings?: number;
    suggestions?: number;
}
export declare class TripInsightResponseDto {
    tripSummary: TripSummaryDto;
    findings: FindingDto[];
    readiness: ReadinessSummaryDto;
    overallStatus: OverallStatus;
}
