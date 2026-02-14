import { DayScheduleResult } from './scheduler.interface';
import { DayOfWeek } from '../utils/time-utils';
export type ReplanEvent = {
    type: 'WEATHER_CHANGED';
    isRaining: boolean;
} | {
    type: 'POI_CLOSED';
    poiId: string;
    reason?: string;
    effectiveFromMin?: number;
} | {
    type: 'CROWD_SPIKE';
    poiId: string;
    crowdLevel: 0 | 1 | 2 | 3;
    queueExtraMin?: number;
} | {
    type: 'TRAFFIC_DISRUPTION';
    area?: string;
    severity: 1 | 2 | 3;
} | {
    type: 'USER_EDIT';
    removedStopIds?: string[];
    pinnedStopIds?: string[];
};
export interface ChangeBudget {
    maxChangeCount?: number;
    maxTimeShiftMin?: number;
    allowAddNewPoi?: boolean;
    allowRemoveMustSee?: boolean;
}
export interface ReplanRequest {
    nowMin: number;
    currentLocation: {
        lat: number;
        lng: number;
    };
    previous: DayScheduleResult;
    poiPool: import('./poi.interface').Poi[];
    restStops: import('./rest-stop.interface').RestStop[];
    getTransit: (from: {
        lat: number;
        lng: number;
    }, to: {
        lat: number;
        lng: number;
    }, policy: import('./planning-policy.interface').PlanningPolicy) => Promise<import('./transit-segment.interface').TransitSegment[]>;
    dayOfWeek: DayOfWeek;
    endMin: number;
    lockWindowMin?: number;
    event: ReplanEvent;
    pinnedPoiIds?: string[];
    changeBudget?: ChangeBudget;
}
export type ChangeReason = 'POI_CLOSED' | 'WEATHER_CHANGE' | 'CROWD_SPIKE' | 'TRAFFIC_DISRUPTION' | 'USER_EDIT' | 'FEASIBILITY_ISSUE' | 'TIME_WINDOW_CONFLICT';
export interface ChangeImpact {
    savedTimeMin?: number;
    reducedWalkMin?: number;
    reducedTransfers?: number;
    improvedOnTimeProb?: number;
}
export interface StructuredExplanation {
    reason: ChangeReason;
    description: string;
    impact?: ChangeImpact;
    alternatives?: Array<{
        description: string;
        keepOriginal?: boolean;
        risk?: string;
    }>;
}
export interface ReplanResult {
    merged: DayScheduleResult;
    diff: {
        keptStopIds: string[];
        removedStopIds: string[];
        addedStopIds: string[];
        movedStopIds: string[];
        changeCount: number;
    };
    explain: string[];
    structuredExplain?: StructuredExplanation[];
    withinBudget: boolean;
    budgetUsage?: {
        changeCount: number;
        maxChangeCount: number;
        maxTimeShiftExceeded: boolean;
    };
}
