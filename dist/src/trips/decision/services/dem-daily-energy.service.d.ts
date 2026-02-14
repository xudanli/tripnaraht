import { DEMEffortMetadataService } from '../../dem/services/dem-effort-metadata.service';
import { PlanDay } from '../plan-model';
export interface DailyEnergyBudget {
    maxEnergyCost: number;
    baseEnergyCost: number;
    ascentEnergyCost: number;
    slopePenalty: number;
    altitudePenalty: number;
    totalEnergyCost: number;
    remainingBudget: number;
}
export interface DailyEnergyConfig {
    baseCostPerKm?: number;
    ascentFactor?: number;
    slopePenaltyFactor?: number;
    altitudePenaltyFactor?: number;
    altitudePenaltyStart?: number;
    maxDailyBudget?: number;
}
export declare class DEMDailyEnergyService {
    private readonly demEffortService?;
    private readonly logger;
    constructor(demEffortService?: DEMEffortMetadataService);
    calculateDailyEnergyBudget(day: PlanDay, config?: DailyEnergyConfig): Promise<DailyEnergyBudget>;
    calculateDynamicDailyBudget(day: PlanDay, routeDirection?: any, userPace?: 'relaxed' | 'moderate' | 'intense'): Promise<DailyEnergyBudget>;
    private extractRoutePoints;
    checkDailyBudgetExceeded(day: PlanDay, routeDirection?: any, userPace?: 'relaxed' | 'moderate' | 'intense'): Promise<{
        exceeded: boolean;
        budget: DailyEnergyBudget;
        warning?: string;
    }>;
}
