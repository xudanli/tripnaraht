import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import { ExecutionPlan, ExecutionResult } from '../interfaces/chain-of-work.interface';
export declare class ExecutionIntegrationService {
    private readonly logger;
    executePlan(plan: ExecutionPlan, request: TripPlanRequest): Promise<ExecutionResult>;
    private generateUuid;
}
