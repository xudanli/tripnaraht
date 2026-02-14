import { OptimizationResult } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { PlanRequest } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import { TripWorldState } from '../world-model';
export declare function extractPlanRequestFromResult(optimizationResult: OptimizationResult, world: TripWorldState): Partial<PlanRequest>;
export declare function inferObjectiveWeights(optimizationResult: OptimizationResult, world: TripWorldState): PlanRequest['objective_weights'];
export declare function extractDiagnostics(optimizationResult: OptimizationResult): {
    criticalWindows: Array<{
        node_id: number;
        slack_to_close_min: number;
    }>;
    minSlack: number;
    riskLevel: 'low' | 'medium' | 'high' | undefined;
    totalBuffer: number;
};
