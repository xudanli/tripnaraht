import { WorldModelContext } from '../shared/world-model.types';
import { TripPlan } from '../plan-model';
import { TravelReadinessResult } from './types/readiness-checklist.types';
export declare class ReadinessAgentService {
    private readonly logger;
    run(world: WorldModelContext, plan: TripPlan): TravelReadinessResult;
    private deriveFromPhysicalReality;
    private deriveFromHumanCapability;
    private deriveFromRouteDirection;
    private deriveFromTripPlan;
    private generateSummary;
}
