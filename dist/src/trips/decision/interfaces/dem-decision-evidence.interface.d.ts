export interface DemDecisionEvidence {
    segmentId: string;
    elevationProfile: number[];
    cumulativeAscent: number;
    maxSlopePct: number;
    rollingAscent3Days: number;
    fatigueIndex: number;
    violation: 'HARD' | 'SOFT' | 'NONE';
    explanation: string;
    metadata?: {
        consecutiveHighAltitudeDays?: number;
        avgSlopePct?: number;
        distanceM?: number;
        elevationRange?: {
            min: number;
            max: number;
        };
        criticalBreakpoints?: Array<{
            distance: number;
            reason: string;
            severity: 'LOW' | 'MEDIUM' | 'HIGH';
        }>;
    };
}
export interface CorridorQualityScore {
    totalScore: number;
    viewExposureScore: number;
    elevationVariance: number;
    slopePenalty: number;
    explanation: string;
}
export interface RollingFatigueDetection {
    detected: boolean;
    startDay?: number;
    endDay?: number;
    rollingAscent3Days: number;
    userThreshold: number;
    suggestedAction: 'INSERT_REST_DAY' | 'SPLIT_DAYS' | 'REDUCE_ASCENT' | 'NONE';
    explanation: string;
}
export interface DemEvidencePipelineResult {
    segmentEvidences: DemDecisionEvidence[];
    hasHardViolation: boolean;
    hasSoftViolation: boolean;
    rollingFatigue?: RollingFatigueDetection;
    corridorQuality?: CorridorQualityScore;
    explainableFailure?: {
        reason: string;
        affectedDays: number[];
        userImpact: string;
    };
    canProceed: boolean;
}
