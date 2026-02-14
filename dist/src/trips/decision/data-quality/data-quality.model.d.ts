export type DataConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type DataSource = 'api_verified' | 'database_cached' | 'user_provided' | 'inferred' | 'default' | 'unknown';
export interface DataQuality {
    confidence: DataConfidence;
    freshness?: number;
    source: DataSource;
    lastUpdatedAt?: string;
}
export interface ActivityCandidateQuality {
    openingHours?: DataQuality;
    duration?: DataQuality;
    cost?: DataQuality;
    location?: DataQuality;
    travelTime?: DataQuality;
    weatherSensitivity?: DataQuality;
}
export type PlanReliabilityLevel = 'A' | 'B' | 'C';
export interface PlanReliability {
    level: PlanReliabilityLevel;
    reasons: string[];
    missingDataFields: string[];
    assumptions: Array<{
        field: string;
        assumption: string;
        impact: 'low' | 'medium' | 'high';
    }>;
}
export interface DegradationStrategy {
    unknownOpeningHours: 'assume_open' | 'mark_verify' | 'exclude';
    unreliableTravelTime: {
        bufferMultiplier: number;
        reduceDensity: boolean;
    };
    uncertainWeather: {
        outdoorActivityPenalty: number;
        preferIndoorAlternatives: boolean;
    };
}
export declare const DEFAULT_DEGRADATION_STRATEGY: DegradationStrategy;
export declare function assessDataQuality(source: DataSource, freshness?: number): DataConfidence;
export declare function assessPlanReliability(qualityMap: Record<string, DataQuality>): PlanReliability;
