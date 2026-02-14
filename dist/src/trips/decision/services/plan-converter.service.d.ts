import { TripPlan } from '../plan-model';
import { RoutePlanDraft } from '../shared/world-model.types';
import { TripWorldState } from '../world-model';
export declare class PlanConverterService {
    convertTripPlanToRoutePlanDraft(plan: TripPlan, tripId: string, routeDirectionId: string): RoutePlanDraft;
    applyRoutePlanDraftToTripPlan(draft: RoutePlanDraft, originalPlan: TripPlan, world: TripWorldState): TripPlan;
}
