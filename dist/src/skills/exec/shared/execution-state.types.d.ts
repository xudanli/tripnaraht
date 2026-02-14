export type ExecutionPhase = 'ON_TRIP' | 'CHANGE_HANDLING' | 'FALLBACK';
export type ReminderType = 'departure' | 'check_in' | 'activity_start' | 'transport' | 'weather' | 'safety' | 'budget' | 'custom';
export interface Reminder {
    id: string;
    type: ReminderType;
    title: string;
    message: string;
    triggerTime: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    relatedItemId?: string;
    actionUrl?: string;
    metadata?: Record<string, any>;
}
export type ChangeType = 'schedule_change' | 'location_change' | 'activity_cancelled' | 'transport_delay' | 'weather_impact' | 'budget_overrun' | 'user_request';
export interface ChangeHandlingResult {
    changeId: string;
    changeType: ChangeType;
    originalPlan: any;
    adjustedPlan: any;
    impact: {
        schedule?: string;
        budget?: string;
        experience?: string;
        risk?: string;
    };
    alternatives?: Array<{
        option: string;
        description: string;
        impact: string;
    }>;
    recommendations: string[];
    requiresConfirmation: boolean;
    success?: boolean;
    message?: string;
    updatedSchedule?: {
        date: string;
        schedule: {
            items: Array<{
                placeId: number;
                placeName: string;
                startTime: string;
                endTime: string;
                status?: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
                [key: string]: any;
            }>;
        };
    };
}
export interface FallbackSolution {
    id: string;
    type: 'minimal' | 'experience' | 'safety';
    title: string;
    description: string;
    changes: Array<{
        itemId: string;
        action: 'modify' | 'remove' | 'add';
        newTime?: string;
        newPlace?: any;
    }>;
    impact: {
        arrivalTime: string;
        missingPlaces: number;
        riskChange: 'low' | 'medium' | 'high';
    };
    recommended?: boolean;
}
export interface FallbackPlan {
    id: string;
    triggerReason: string;
    originalPlan: any;
    fallbackPlan?: any;
    solutions?: FallbackSolution[];
    explanation: string;
    impact: {
        schedule?: string;
        budget?: string;
        experience?: string;
    };
    confidence: 'low' | 'medium' | 'high';
}
export interface ExecutionState {
    tripId: string;
    phase: ExecutionPhase;
    currentDay: number;
    currentDate: string;
    reminders: Reminder[];
    pendingChanges: ChangeHandlingResult[];
    activeFallbacks: FallbackPlan[];
    lastUpdated: string;
}
