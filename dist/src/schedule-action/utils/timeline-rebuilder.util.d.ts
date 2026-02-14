import { PlannedStop } from '../../planning-policy/interfaces/scheduler.interface';
import { Poi } from '../../planning-policy/interfaces/poi.interface';
export declare class TimelineRebuilder {
    private readonly config;
    rebuildTimeline(stops: PlannedStop[], targetPoi: Poi | null, targetStopIndex: number, dayStartMin?: number, dayEndMin?: number): PlannedStop[] | null;
    private findAvailableMorningSlot;
    private getEarliestArrivalTime;
}
