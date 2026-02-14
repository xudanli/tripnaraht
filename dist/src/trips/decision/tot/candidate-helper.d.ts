import { TripWorldState, ActivityCandidate, ISODate } from '../world-model';
import { PlanSlot, PlanDay } from '../plan-model';
export declare function findActivityCandidate(world: TripWorldState, poiId: string, date: ISODate): ActivityCandidate | undefined;
export declare function extractActivityCandidatesFromPlan(world: TripWorldState, plan: {
    days: PlanDay[];
}): Map<string, {
    candidate: ActivityCandidate;
    slot: PlanSlot;
    date: ISODate;
}>;
export declare function getAllActivityCandidates(world: TripWorldState, plan: {
    days: PlanDay[];
}): ActivityCandidate[];
