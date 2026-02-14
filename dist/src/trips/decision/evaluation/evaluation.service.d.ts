import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { DecisionRunLog } from '../decision-log';
import { ConstraintCheckResult } from '../constraints';
import { PlanDiff } from '../plan-diff';
export interface PlanMetrics {
    executability: {
        violationsCount: number;
        errorCount: number;
        warningCount: number;
        executabilityRate: number;
    };
    stability: {
        editDistanceScore: number;
        changedSlotsRatio: number;
        stabilityScore: number;
    };
    experience: {
        rhythmBalance: number;
        diversity: number;
        backtrackRatio: number;
        totalActiveMinutes: number;
        totalTravelMinutes: number;
    };
    cost: {
        estimatedTotalCost: number;
        costPerDay: number;
        budgetUtilization: number;
    };
}
export interface EvaluationResult {
    planId: string;
    metrics: PlanMetrics;
    timestamp: string;
    version: string;
}
export interface ReplayConfig {
    strategyMix: Array<'abu' | 'drdre' | 'neptune'>;
    policyProfile?: string;
    objectiveWeights?: {
        satisfaction: number;
        violationRisk: number;
        robustness: number;
        cost: number;
    };
}
export interface ReplayResult {
    config: ReplayConfig;
    plan: TripPlan;
    metrics: PlanMetrics;
    log: DecisionRunLog;
    timestamp: string;
}
export declare class EvaluationService {
    private readonly logger;
    evaluatePlan(state: TripWorldState, plan: TripPlan, constraintResult: ConstraintCheckResult, diff?: PlanDiff): PlanMetrics;
    private calculateExecutability;
    private calculateStability;
    private calculateExperience;
    private calculateBacktrackRatio;
    private calculateCost;
    replayWithConfig(state: TripWorldState, config: ReplayConfig, planner: (state: TripWorldState, config: ReplayConfig) => Promise<{
        plan: TripPlan;
        log: DecisionRunLog;
    }>): Promise<ReplayResult>;
    batchReplay(state: TripWorldState, configs: ReplayConfig[], planner: (state: TripWorldState, config: ReplayConfig) => Promise<{
        plan: TripPlan;
        log: DecisionRunLog;
    }>): Promise<ReplayResult[]>;
    compareReplayResults(results: ReplayResult[]): {
        bestByExecutability: ReplayResult | null;
        bestByStability: ReplayResult | null;
        bestByExperience: ReplayResult | null;
        bestByCost: ReplayResult | null;
        summary: Array<{
            config: ReplayConfig;
            executabilityRate: number;
            stabilityScore: number;
            experienceScore: number;
            costUtilization: number;
        }>;
    };
    private timeDiffMinutes;
    private calculateDistance;
    private toRad;
}
