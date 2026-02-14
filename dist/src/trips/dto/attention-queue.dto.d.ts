export declare enum AttentionItemType {
    SCHEDULE_CONFLICT = "schedule_conflict",
    ROAD_CLOSED = "road_closed",
    WEATHER_RISK = "weather_risk",
    BUDGET_ALERT = "budget_alert",
    SAFETY_RISK = "safety_risk",
    BOOKING_ISSUE = "booking_issue",
    OTHER = "other"
}
export declare enum AttentionSeverity {
    CRITICAL = "critical",
    HIGH = "high",
    MEDIUM = "medium",
    LOW = "low"
}
export declare enum AttentionStatus {
    NEW = "new",
    ACKNOWLEDGED = "acknowledged",
    RESOLVED = "resolved"
}
export declare class AttentionItemDto {
    id: string;
    type: AttentionItemType;
    title: string;
    description?: string;
    tripId: string;
    severity: AttentionSeverity;
    createdAt: string;
    updatedAt?: string;
    status?: AttentionStatus;
    metadata?: {
        day?: number;
        poiId?: string;
        evidenceIds?: string[];
        actionUrl?: string;
        [key: string]: any;
    };
}
export declare class AttentionQueueResponseDto {
    items: AttentionItemDto[];
    total: number;
    limit: number;
    offset: number;
}
export declare class GetAttentionQueueQueryDto {
    limit?: number;
    offset?: number;
    severity?: AttentionSeverity;
    type?: AttentionItemType;
    tripId?: string;
}
