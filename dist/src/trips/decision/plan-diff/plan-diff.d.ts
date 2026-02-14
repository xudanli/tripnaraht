import { PlanSlot, TripPlan } from '../plan-model';
export type SlotChangeType = 'moved' | 'removed' | 'added' | 'swap' | 'unchanged';
export interface SlotDiff {
    slotId: string;
    changeType: SlotChangeType;
    oldSlot?: PlanSlot;
    newSlot?: PlanSlot;
    reason?: string;
}
export interface PlanDiff {
    days: Array<{
        date: string;
        slotDiffs: SlotDiff[];
    }>;
    summary: {
        totalChanged: number;
        moved: number;
        removed: number;
        added: number;
        swapped: number;
        unchanged: number;
        editDistanceScore: number;
    };
}
export declare function computePlanDiff(oldPlan: TripPlan, newPlan: TripPlan): PlanDiff;
export interface MinimalEditStrategy {
    preserveLocked: boolean;
    preserveAnchors: boolean;
    maxReorderDistance: number;
    preferSwap: boolean;
}
export declare const DEFAULT_MINIMAL_EDIT_STRATEGY: MinimalEditStrategy;
