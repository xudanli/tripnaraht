import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { DecisionParams } from '../../../agent/memory/interfaces/decision-params.interface';
import { DEMDailyEnergyService } from './dem-daily-energy.service';
import { DEMRiskScoringService } from './dem-risk-scoring.service';
export interface DryRunResult {
    willFail: boolean;
    failureDay?: number;
    failureReason?: string;
    riskPoints: Array<{
        day: number;
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
        reason: string;
        suggestion?: string;
    }>;
    energyOverloads: Array<{
        day: number;
        expectedEnergy: number;
        maxEnergy: number;
        overload: number;
    }>;
    constraintViolations: Array<{
        day: number;
        constraint: string;
        value: number;
        limit: number;
    }>;
    recommendations: string[];
}
export declare class DryRunPlannerService {
    private readonly demDailyEnergyService?;
    private readonly demRiskScoringService?;
    private readonly logger;
    constructor(demDailyEnergyService?: DEMDailyEnergyService, demRiskScoringService?: DEMRiskScoringService);
    simulatePlan(state: TripWorldState, plan: TripPlan, decisionParams?: DecisionParams): Promise<DryRunResult>;
    generateAdjustmentSuggestions(result: DryRunResult): string[];
}
