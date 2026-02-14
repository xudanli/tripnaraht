import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { ObjectiveWeights } from '../config/objective-config';
import { PlanRequest } from '../../../itinerary-optimization/interfaces/plan-request.interface';
export interface DimensionWeights {
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
}
export declare function computeBaseWeights(objectiveWeights: ObjectiveWeights, planRequest?: PlanRequest): DimensionWeights;
export declare function applyDynamicAdjust(baseWeights: DimensionWeights, world: TripWorldState, plan: TripPlan): DimensionWeights;
export declare function normalizeWeights(weights: DimensionWeights): DimensionWeights;
export declare function computeFinalWeights(objectiveWeights: ObjectiveWeights, world: TripWorldState, plan: TripPlan, planRequest?: PlanRequest): DimensionWeights;
