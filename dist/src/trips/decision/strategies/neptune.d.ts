import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
export interface RepairTrigger {
    code: 'WEATHER' | 'CLOSED' | 'TIME_OVER' | 'BUDGET_OVER' | 'USER_CHANGE' | 'RISK_VIOLATION';
    date?: string;
    slotId?: string;
    details?: Record<string, any>;
}
export interface NeptuneRepairResult {
    plan: TripPlan;
    triggers: RepairTrigger[];
    changedSlotIds: string[];
    explanation: string;
}
export declare function neptuneRepairPlan(state: TripWorldState, plan: TripPlan, riskWeights?: Map<string, number>): NeptuneRepairResult;
