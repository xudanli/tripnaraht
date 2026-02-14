import { DecisionTrigger } from '../decision-log';
import { TripWorldState } from '../world-model';
export type RepairEventType = 'weather_update' | 'availability_update' | 'user_behavior' | 'traffic_change' | 'manual_trigger';
export interface RepairEvent {
    type: RepairEventType;
    timestamp: string;
    payload: Record<string, any>;
    severity: 'low' | 'medium' | 'high';
}
export interface EventTriggerConfig {
    debounceMs: number;
    throttleMs: number;
    minIntervalMs: number;
}
export declare const DEFAULT_EVENT_TRIGGER_CONFIG: EventTriggerConfig;
export declare class EventTriggerService {
    private readonly logger;
    private lastTriggerTime;
    private pendingEvents;
    private debounceTimer?;
    private readonly config;
    constructor();
    registerEvent(event: RepairEvent): boolean;
    private processEvents;
    private mergeEvents;
    private shouldTriggerRepair;
    mapToDecisionTrigger(eventType: RepairEventType): DecisionTrigger;
    detectStateChanges(oldState: TripWorldState, newState: TripWorldState): RepairEvent[];
}
