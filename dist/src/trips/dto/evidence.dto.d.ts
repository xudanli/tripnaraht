export declare enum EvidenceType {
    OPENING_HOURS = "opening_hours",
    ROAD_CLOSURE = "road_closure",
    WEATHER = "weather",
    BOOKING = "booking",
    OTHER = "other"
}
export declare enum EvidenceSeverity {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high"
}
export declare enum EvidenceStatus {
    NEW = "new",
    ACKNOWLEDGED = "acknowledged",
    RESOLVED = "resolved",
    DISMISSED = "dismissed"
}
export declare enum EvidenceFreshnessStatus {
    FRESH = "FRESH",
    STALE = "STALE",
    EXPIRED = "EXPIRED"
}
export declare enum EvidenceConfidenceLevel {
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW"
}
export declare enum EvidenceQualityLevel {
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW"
}
export declare class EvidenceFreshnessDto {
    fetchedAt: string;
    expiresAt?: string;
    freshnessStatus: EvidenceFreshnessStatus;
    recommendedRefreshAt?: string;
}
export declare class EvidenceConfidenceDto {
    score: number;
    level: EvidenceConfidenceLevel;
    factors: string[];
}
export declare class EvidenceQualityComponentsDto {
    sourceReliability: number;
    timeliness: number;
    completeness: number;
    multiSourceVerification: number;
}
export declare class EvidenceQualityScoreDto {
    overallScore: number;
    components: EvidenceQualityComponentsDto;
    level: EvidenceQualityLevel;
    explanation: string;
}
export declare class EvidenceItemDto {
    id: string;
    type: EvidenceType;
    title: string;
    description: string;
    source?: string;
    link?: string;
    timestamp: string;
    poiId?: string;
    day?: number;
    severity?: EvidenceSeverity;
    metadata?: Record<string, any>;
    status?: EvidenceStatus;
    userNote?: string;
    acknowledgedAt?: string;
    resolvedAt?: string;
    dismissedAt?: string;
    freshness?: EvidenceFreshnessDto;
    confidence?: EvidenceConfidenceDto;
    qualityScore?: EvidenceQualityScoreDto;
}
export declare class EvidenceListResponseDto {
    items: EvidenceItemDto[];
    total: number;
    limit: number;
    offset: number;
}
export declare enum EvidencePriorityFilter {
    ALL = "all",
    HIGH = "high",
    MEDIUM_AND_HIGH = "medium_and_high"
}
export declare enum EvidenceGroupBy {
    NONE = "none",
    IMPORTANCE = "importance",
    TYPE = "type",
    DAY = "day"
}
export declare enum EvidenceSortBy {
    TIME = "time",
    IMPORTANCE = "importance",
    RELEVANCE = "relevance",
    FRESHNESS = "freshness",
    QUALITY = "quality"
}
export declare class GetEvidenceQueryDto {
    limit?: number;
    offset?: number;
    day?: number;
    type?: EvidenceType;
    priority?: EvidencePriorityFilter;
    groupBy?: EvidenceGroupBy;
    sortBy?: EvidenceSortBy;
}
export declare class UpdateEvidenceRequestDto {
    status?: EvidenceStatus;
    userNote?: string;
}
export declare class UpdateEvidenceResponseDto {
    evidenceId: string;
    status: EvidenceStatus;
    updatedAt: string;
    userNote?: string;
}
export declare class BatchUpdateEvidenceItemDto {
    evidenceId: string;
    status?: EvidenceStatus;
    userNote?: string;
}
export declare class BatchUpdateEvidenceRequestDto {
    updates: BatchUpdateEvidenceItemDto[];
}
export declare class BatchUpdateEvidenceResponseDto {
    updated: number;
    failed: number;
    errors?: Array<{
        evidenceId: string;
        error: string;
    }>;
}
