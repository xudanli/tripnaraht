import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { ConstraintDSL } from '../constraints/constraint-dsl.types';
import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { ConstraintChecker } from '../constraints/constraint-checker';
export interface PlanVariant {
    id: string;
    plan: TripPlan;
    score: PlanScore;
    tradeoffs: Tradeoff[];
    feasibility: {
        isValid: boolean;
        violations: number;
        conflicts?: number;
    };
}
export interface PlanScore {
    total: number;
    breakdown: {
        satisfaction: number;
        violationRisk: number;
        robustness: number;
        cost: number;
    };
}
export interface Tradeoff {
    constraint: string;
    sacrificed: string;
    reason: string;
    can_adjust: boolean;
    impact_score?: number;
}
export type StrategyType = 'conservative' | 'balanced' | 'aggressive';
export declare class MultiPlanGenerator {
    private readonly decisionEngine?;
    private readonly constraintChecker?;
    private readonly logger;
    constructor(decisionEngine?: TripDecisionEngineService, constraintChecker?: ConstraintChecker);
    generateMultiplePlans(state: TripWorldState, constraints: ConstraintDSL): Promise<PlanVariant[]>;
    private generatePlanWithStrategy;
    private adjustConstraintsForStrategy;
    private scorePlan;
    private calculateSatisfactionScore;
    private calculateViolationRiskScore;
    private calculateRobustnessScore;
    private calculateCostScore;
    private getStrategyWeights;
    private analyzeTradeoffs;
    private calculateActualPace;
    private matchPace;
    private calculateActualScenery;
    private matchScenery;
    private calculatePhotographyScore;
    private findCandidate;
    private cloneState;
}
