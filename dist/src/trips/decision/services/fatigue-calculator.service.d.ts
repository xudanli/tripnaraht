import { DayProfile, PaceConstraints } from '../interfaces/day-profile.interface';
import { HumanCapabilityModel } from '../models/human-capability.model';
export type TerrainType = 'easy' | 'moderate' | 'technical' | 'extreme' | 'alpine' | 'glacier' | 'desert' | 'jungle' | 'coastal' | 'scree';
export interface TerrainCharacteristics {
    type: TerrainType;
    fatigueFactor: number;
    speedMultiplier: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    descriptionZh: string;
    requiredGear?: string[];
    bestSeasons?: number[];
}
export interface FatigueContext {
    dayOfTrip?: number;
    totalTripDays?: number;
    humanModel?: HumanCapabilityModel;
    terrainType?: TerrainType;
    averageElevationM?: number;
    fatigueHistory?: DayFatigueRecord[];
    isRestDay?: boolean;
    sleepQuality?: number;
    recoveryConditions?: RecoveryConditions;
}
export interface DayFatigueRecord {
    dayIndex: number;
    fatigueIndex: number;
    isRestDay: boolean;
    cumulativeFatigue: number;
}
export interface RecoveryConditions {
    accommodationType?: 'camping' | 'basic' | 'comfortable' | 'luxury';
    hasHotShower?: boolean;
    hasAdequateRest?: boolean;
    nutritionQuality?: number;
    sleepingAltitudeM?: number;
}
export declare class FatigueCalculatorService {
    computeFatigueIndex(day: DayProfile, pace: PaceConstraints): number;
    computeFatigueIndexEnhanced(day: DayProfile, pace: PaceConstraints, context?: FatigueContext): number;
    estimateMovingHours(distanceKm: number, ascentM: number): number;
    estimateMovingHoursEnhanced(distanceKm: number, ascentM: number, options?: {
        descentM?: number;
        terrainType?: 'easy' | 'moderate' | 'technical' | 'extreme';
        averageElevationM?: number;
    }): number;
    getFatigueLevel(fatigueIndex: number): {
        level: 'easy' | 'moderate' | 'challenging' | 'extreme';
        description: string;
        descriptionZh: string;
        emoji: string;
    };
    private calculateSlopePenalty;
    private calculateCumulativeFatigue;
    private calculateAltitudeFactor;
    private calculateTerrainFactor;
    private getTerrainSpeedMultiplier;
    getTerrainCharacteristics(terrainType: TerrainType): TerrainCharacteristics;
    private getAltitudeSpeedMultiplier;
    calculateRecoveryFactor(context: {
        isRestDay: boolean;
        sleepQuality?: number;
        recoveryConditions?: RecoveryConditions;
        humanModel?: HumanCapabilityModel;
        fatigueHistory?: DayFatigueRecord[];
    }): number;
    calculateCumulativeFatigueWithRecovery(currentDayFatigue: number, context: FatigueContext): number;
    computeFatigueIndexUltimate(day: DayProfile, pace: PaceConstraints, context: FatigueContext): {
        dailyFatigue: number;
        cumulativeFatigue: number;
        recoveryFactor: number;
        effectiveFatigue: number;
        warnings: string[];
    };
    suggestRestDays(dayProfiles: DayProfile[], pace: PaceConstraints, humanModel?: HumanCapabilityModel): {
        suggestedRestDayIndices: number[];
        reason: string;
        projectedMaxCumulativeFatigue: number;
    };
    calculateRestDaysNeeded(currentCumulativeFatigue: number, targetFatigue: number, context?: {
        recoveryConditions?: RecoveryConditions;
        humanModel?: HumanCapabilityModel;
    }): number;
}
