import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { OptimizationResult } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { PlanningPolicy } from '../../../planning-policy/interfaces/planning-policy.interface';
export interface HardGateResult {
    allowed: boolean;
    violations: string[];
}
export declare function checkHardGate(world: TripWorldState, plan: TripPlan, optimizationResult?: OptimizationResult, planningPolicy?: PlanningPolicy): HardGateResult;
