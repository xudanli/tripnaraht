export interface TripFeedback {
    tripId: string;
    userId: string;
    feedbackAt: Date;
    mostTiredDay?: number;
    mostRelaxedDay?: number;
    overallIntensity: 'TOO_LIGHT' | 'JUST_RIGHT' | 'TOO_TIRED';
    altitudeDiscomfort?: 'NONE' | 'MILD' | 'SEVERE';
    additionalFeedback?: {
        daysNeedingAdjustment?: number[];
        issues?: string[];
        suggestions?: string[];
    };
}
export interface HumanCapabilityAdjustment {
    profileId: string;
    adjustmentType: 'REDUCE_ASCENT' | 'INCREASE_ASCENT' | 'REDUCE_PACE' | 'INCREASE_PACE' | 'ADJUST_ALTITUDE';
    adjustmentPercentage: number;
    reason: string;
    confidence: number;
}
export interface FeedbackAnalysisResult {
    needsAdjustment: boolean;
    adjustments: HumanCapabilityAdjustment[];
    summary: string;
}
