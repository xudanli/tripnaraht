import { PlanningPolicy } from '../interfaces/planning-policy.interface';
import { Poi } from '../interfaces/poi.interface';
import { TransitSegment } from '../interfaces/transit-segment.interface';
import { ReplanEvent } from '../interfaces/replanner.interface';
import { DayOfWeek } from '../utils/time-utils';
export interface PoiFeasibility {
    feasible: boolean;
    reason?: string;
    waitMin?: number;
    inOpenWindow: boolean;
    pastLastEntry: boolean;
    isClosedDate: boolean;
}
export interface TransitFeasibility {
    feasible: boolean;
    reason?: string;
    violatesHardConstraints: boolean;
}
export interface WaitEstimate {
    waitMin: number;
    reason: string;
    nextOpenMin?: number;
}
export declare class FeasibilityService {
    isPoiFeasible(poi: Poi, atTimeMin: number, policy: PlanningPolicy, dayOfWeek: DayOfWeek, dateISO?: string): PoiFeasibility;
    isTransitFeasible(segment: TransitSegment, policy: PlanningPolicy): TransitFeasibility;
    estimateWait(poi: Poi, atTimeMin: number, dayOfWeek: DayOfWeek, dateISO?: string, event?: ReplanEvent): WaitEstimate;
    private hhmmToMin;
}
