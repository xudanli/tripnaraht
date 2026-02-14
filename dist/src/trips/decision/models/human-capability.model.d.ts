export type PreferredPace = 'SLOW' | 'MEDIUM' | 'FAST';
export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type HighAltitudeExperience = 'NONE' | 'BASIC' | 'ADVANCED';
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
    metadata?: Record<string, any>;
}
export declare function createHumanCapabilityModelFromProfile(profileId: string, keywords: {
    pace?: 'slow' | 'relaxed' | 'normal' | 'fast' | 'intense';
    fitness?: 'low' | 'medium' | 'high' | 'extreme';
    riskTolerance?: 'low' | 'medium' | 'high';
    highAltitudeExperience?: 'none' | 'basic' | 'advanced';
}): HumanCapabilityModel;
export declare function projectToDecisionParams(model: HumanCapabilityModel): import('../shared/world-model.types').DecisionParams;
