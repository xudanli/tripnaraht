export interface UserPreferenceInput {
    pace?: 'relaxed' | 'moderate' | 'intense';
    riskTolerance?: 'low' | 'medium' | 'high';
    interests?: string[];
    specialNeeds?: string[];
}
export interface DecisionParams {
    maxDailyAscentM: number;
    rollingAscent3DaysThreshold: number;
    weatherRiskWeight: number;
    maxSlopeTolerance: number;
    bufferDayBias: number;
    sunriseSunsetWindowWeight: number;
    corridorQualityWeight: number;
}
export declare class UserPersonaMappingService {
    static mapPreferenceToParams(preference: UserPreferenceInput, baseParams?: Partial<DecisionParams>): DecisionParams;
    static getPreferenceDescription(preference: UserPreferenceInput): string;
}
