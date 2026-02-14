import { ActivityCandidate, TripWorldState, TravelLeg, GeoPoint } from '../world-model';
import { PlanSlot } from '../plan-model';
export interface DrDreScheduleInput {
    date: string;
    startTime: string;
    endTime: string;
    bufferMin: number;
    startPoint?: GeoPoint;
    riskWeights?: Map<string, number>;
    previousElevation?: number;
}
export declare function drdreBuildDaySchedule(state: TripWorldState, input: DrDreScheduleInput, candidates: ActivityCandidate[], getTravelLeg: (from: GeoPoint, to: GeoPoint) => Promise<TravelLeg>): Promise<PlanSlot[]>;
