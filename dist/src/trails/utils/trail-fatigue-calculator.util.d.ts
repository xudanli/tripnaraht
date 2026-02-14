import { PacingConfig } from '../../trips/interfaces/pacing-config.interface';
export interface TrailFatigueResult {
    baseHpCost: number;
    difficultyPenalty: number;
    elevationPenalty: number;
    totalHpCost: number;
    estimatedDurationMin: number;
    exceedsLimit: boolean;
    recommendedRestCount: number;
}
export declare class TrailFatigueCalculator {
    static calculateFatigue(trail: {
        distanceKm: number;
        elevationGainM: number;
        maxElevationM?: number;
        difficultyLevel?: string;
        estimatedDurationHours?: number;
    }, pacingConfig: PacingConfig): TrailFatigueResult;
    private static getDifficultyMultiplier;
    private static getElevationMultiplier;
    private static estimateDuration;
    private static calculateRestCount;
    static isTrailSuitable(trail: {
        distanceKm: number;
        elevationGainM: number;
        maxElevationM?: number;
        difficultyLevel?: string;
    }, pacingConfig: PacingConfig): {
        suitable: boolean;
        reason?: string;
        fatigueResult: TrailFatigueResult;
    };
}
