import { ConstraintDSL, ConstraintConflict, ConstraintConflictResult, TradeoffExplanation } from './constraint-dsl.types';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
export declare class ConstraintConflictResolver {
    private readonly logger;
    detectAndExplainConflicts(constraints: ConstraintDSL, plan: TripPlan | null, state: TripWorldState): Promise<ConstraintConflictResult>;
    private detectBudgetVsComfortConflict;
    private detectPaceVsPhysicalConflict;
    private detectDateWindowVsActivityConflict;
    private detectTransportVsTimeConflict;
    private detectRiskToleranceConflict;
    generateTradeoffExplanation(conflict: ConstraintConflict, currentPlan: TripPlan | null): TradeoffExplanation;
    private analyzeConstraintChange;
    private analyzeOverallImpact;
}
