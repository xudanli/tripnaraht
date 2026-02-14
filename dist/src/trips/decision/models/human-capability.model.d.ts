export type PreferredPace = 'SLOW' | 'MEDIUM' | 'FAST';
export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type HighAltitudeExperience = 'NONE' | 'BASIC' | 'ADVANCED';
export type FitnessAssessmentSource = 'QUESTIONNAIRE' | 'HISTORICAL' | 'WEARABLE' | 'FIRST_DAY_TEST' | 'USER_SELF_REPORT' | 'DEFAULT';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type FitnessLevel = 'LOW' | 'MEDIUM_LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH';
export type AgeGroup = '18-29' | '30-39' | '40-49' | '50-59' | '60+';
export interface AcclimatizationState {
    acclimatizedAltitudeM: number;
    daysAtCurrentAltitude: number;
    totalAcclimatizationDays: number;
    acclimatizationEfficiency: number;
    hasAMSSymptoms?: boolean;
    lastAltitudeChangeDate?: Date;
}
export interface AcclimatizationRule {
    altitudeThresholdM: number;
    metersPerAcclimatizationDay: number;
    maxDailySleepingAltitudeGainM: number;
}
export interface FitnessQuestionnaireAnswers {
    weeklyExercise: 0 | 1 | 2 | 3 | 4;
    longestHike: 0 | 1 | 2 | 3 | 4;
    elevationExperience: 0 | 1 | 2 | 3 | 4;
    ageGroup: AgeGroup;
}
export interface TripFitnessFeedback {
    tripId: string;
    userId: string;
    plannedFatigueIndex: number;
    actualEffortRating: 1 | 2 | 3;
    completedAsPlanned: boolean;
    adjustmentsMade?: string[];
    feedbackAt: Date;
}
export interface CalibrationRecord {
    date: Date;
    factor: number;
    feedbackCount: number;
    source: FitnessAssessmentSource;
}
export interface HumanCapabilityModel {
    profileId: string;
    maxDailyAscentM: number;
    rollingAscent3DaysM: number;
    maxSlopePct: number;
    preferredPace: PreferredPace;
    riskTolerance: RiskTolerance;
    highAltitudeExperience: HighAltitudeExperience;
    maxElevationM?: number;
    requiresGradualAscent?: boolean;
    bufferDayBias?: 'LOW' | 'MEDIUM' | 'HIGH';
    weatherRiskWeight?: number;
    age?: number;
    ageGroup?: AgeGroup;
    ageModifier?: number;
    fitnessScore?: number;
    fitnessLevel?: FitnessLevel;
    assessmentSource?: FitnessAssessmentSource;
    confidenceLevel?: ConfidenceLevel;
    completedTripCount?: number;
    currentConditionModifier?: number;
    calibrationHistory?: CalibrationRecord[];
    acclimatizationState?: AcclimatizationState;
    acclimatizationRateModifier?: number;
    amsSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
    metadata?: Record<string, any>;
}
export declare function calculateAgeModifier(age: number): number;
export declare function ageGroupToMidAge(ageGroup: AgeGroup): number;
export declare function questionnaireScoreToFitnessLevel(score: number): FitnessLevel;
export declare function fitnessLevelToBaseAscent(level: FitnessLevel): {
    maxDailyAscentM: number;
    rollingAscent3DaysM: number;
    maxSlopePct: number;
};
export declare function calculateConfidenceLevel(tripCount: number, source: FitnessAssessmentSource): ConfidenceLevel;
export declare function createHumanCapabilityModelFromProfile(profileId: string, keywords: {
    pace?: 'slow' | 'relaxed' | 'normal' | 'fast' | 'intense';
    fitness?: 'low' | 'medium' | 'high' | 'extreme';
    riskTolerance?: 'low' | 'medium' | 'high';
    highAltitudeExperience?: 'none' | 'basic' | 'advanced';
}): HumanCapabilityModel;
export declare function createHumanCapabilityModelFromQuestionnaire(profileId: string, questionnaire: FitnessQuestionnaireAnswers, options?: {
    riskTolerance?: 'low' | 'medium' | 'high';
    highAltitudeExperience?: 'none' | 'basic' | 'advanced';
    pace?: 'slow' | 'relaxed' | 'normal' | 'fast' | 'intense';
    completedTripCount?: number;
}): HumanCapabilityModel;
export declare function calculateQuestionnaireScore(answers: FitnessQuestionnaireAnswers): number;
export declare function calibrateModelFromFeedback(currentModel: HumanCapabilityModel, feedbacks: TripFitnessFeedback[]): HumanCapabilityModel;
export declare function projectToDecisionParams(model: HumanCapabilityModel): import('../shared/world-model.types').DecisionParams;
export declare function getAcclimatizationRules(): AcclimatizationRule[];
export declare function calculateAcclimatizationEfficiency(model: HumanCapabilityModel): number;
export declare function calculateRequiredAcclimatizationDays(currentAltitudeM: number, targetAltitudeM: number, efficiency?: number): number;
export declare function updateAcclimatizationState(currentState: AcclimatizationState | undefined, todaySleepingAltitudeM: number, efficiency?: number): AcclimatizationState;
export declare function checkAltitudeChangeSafety(currentAcclimatizedAltitudeM: number, targetSleepingAltitudeM: number, model: HumanCapabilityModel): {
    isSafe: boolean;
    riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    warnings: string[];
    recommendations: string[];
};
