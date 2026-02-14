import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { OptimizationResult, PlanRequest } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { PlanningPolicy } from '../../../planning-policy/interfaces/planning-policy.interface';
import { ToTScoreResult } from './score-result';
export interface ThoughtInput {
    world: TripWorldState;
    plan: TripPlan;
    optimizationResult?: OptimizationResult;
    planningPolicy?: PlanningPolicy;
    planRequest?: PlanRequest;
}
export interface ThoughtNode extends ThoughtInput {
    id: string;
    parentId?: string;
    depth: number;
    operator?: 'RD_ENUM' | 'DRDRE_SCHEDULE' | 'NEPTUNE_REPAIR' | 'MIXED' | string;
    rationale?: string;
}
export interface ThoughtEvaluator {
    evaluate(input: ThoughtInput): Promise<ToTScoreResult>;
}
