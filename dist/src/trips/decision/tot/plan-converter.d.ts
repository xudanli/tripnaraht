import { RoutePlanDraft } from '../shared/world-model.types';
import { TripPlan } from '../plan-model';
import { TripWorldState } from '../world-model';
export declare function convertRoutePlanDraftToTripPlan(draft: RoutePlanDraft, world: TripWorldState): TripPlan;
