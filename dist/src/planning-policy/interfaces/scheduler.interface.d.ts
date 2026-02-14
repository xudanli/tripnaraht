import { PlanningPolicy } from './planning-policy.interface';
import { Poi } from './poi.interface';
import { TransitSegment } from './transit-segment.interface';
import { RestStop, StopKind } from './rest-stop.interface';
import { DayOfWeek } from '../utils/time-utils';
export interface DayScheduleRequest {
    dateISO: string;
    dayOfWeek: DayOfWeek;
    startMin: number;
    endMin: number;
    startLocation: {
        lat: number;
        lng: number;
    };
    pois: Poi[];
    restStops: RestStop[];
    getTransit: (from: {
        lat: number;
        lng: number;
    }, to: {
        lat: number;
        lng: number;
    }, policy: PlanningPolicy) => Promise<TransitSegment[]>;
    mustSeePoiIds?: string[];
    bufferMin?: number;
}
export interface PlannedStop {
    kind: StopKind;
    id: string;
    name: string;
    startMin: number;
    endMin: number;
    lat: number;
    lng: number;
    notes?: string[];
    transitIn?: TransitSegment;
}
export interface DayScheduleResult {
    stops: PlannedStop[];
    metrics: {
        totalTravelMin: number;
        totalWalkMin: number;
        totalTransfers: number;
        totalQueueMin: number;
        overtimeMin: number;
        hpEnd: number;
        violated?: string[];
    };
}
