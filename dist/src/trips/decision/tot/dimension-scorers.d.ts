import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { OptimizationResult } from '../../../itinerary-optimization/interfaces/plan-request.interface';
export declare function scoreCost(world: TripWorldState, plan: TripPlan, optimizationResult?: OptimizationResult, valueOfTimePerMin?: number): {
    score: number;
    metrics: Record<string, number>;
};
export declare function scoreRisk(world: TripWorldState, plan: TripPlan, optimizationResult?: OptimizationResult): {
    score: number;
    metrics: Record<string, number>;
};
export declare function scorePref(world: TripWorldState, plan: TripPlan, tagAffinity?: Record<string, number>, diversityPenalty?: number, mustSeeBoost?: number): {
    score: number;
    metrics: Record<string, number>;
};
export declare function scoreTime(world: TripWorldState, plan: TripPlan, optimizationResult?: OptimizationResult, travelWeight?: number, waitWeight?: number): {
    score: number;
    metrics: Record<string, number>;
};
export declare function scoreReq(world: TripWorldState, plan: TripPlan, optimizationResult?: OptimizationResult, dropPenaltyWeight?: number, rewardWeight?: number): {
    score: number;
    metrics: Record<string, number>;
};
