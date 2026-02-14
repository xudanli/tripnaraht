export type RhythmType = 'INTENSIVE' | 'RELAXED' | 'FLEXIBLE' | 'THEMED' | 'HYBRID';
export interface RouteRhythmProfile {
    physicalIntensity: number;
    mentalLoad: number;
    informationDensity: number;
    decisionFrequency: number;
    environmentalStimulation: number;
    averageDailySteps: number;
    averageDailyPois: number;
    averageDailyRestTime: number;
    rhythmVariation: number;
}
export interface UserRhythmCapacity {
    physicalCapacity: number;
    attentionCapacity: number;
    emotionalCapacity: number;
    dailyAvailableTime: number;
    preferredRhythmType?: RhythmType;
    rhythmFlexibility: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface RhythmMatchScores {
    physicalMatch: number;
    attentionMatch: number;
    emotionalMatch: number;
    timeMatch: number;
    overallMatch: number;
}
export interface RhythmMatchResult {
    scores: RhythmMatchScores;
    recommendedRhythm: RhythmType;
    recommendationReason: string;
    adjustments: RhythmAdjustment[];
    alternativeRhythms: Array<{
        type: RhythmType;
        score: number;
        reason: string;
    }>;
}
export interface RhythmAdjustment {
    type: 'REDUCE_INTENSITY' | 'INCREASE_REST' | 'REDUCE_POIS' | 'ADJUST_SCHEDULE' | 'OTHER';
    description: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    suggestions: string[];
}
export interface RhythmTypeDefinition {
    type: RhythmType;
    dailySteps: {
        min: number;
        max: number;
    };
    poiCount: {
        min: number;
        max: number;
    };
    restTime: {
        min: number;
        max: number;
    };
    suitableFor: string[];
    warnings: string[];
    typicalSchedule: string;
}
export interface TravelProgress {
    currentDay: number;
    totalDays: number;
    completedActivities: number;
    remainingActivities: number;
    currentFatigue: number;
    currentSatisfaction: number;
}
export interface RhythmAdjustmentResult {
    needsAdjustment: boolean;
    adjustmentType?: 'GRADUAL' | 'IMMEDIATE' | 'PREVENTIVE';
    adjustments: RhythmAdjustment[];
    reasons: string[];
    expectedEffects: string[];
}
