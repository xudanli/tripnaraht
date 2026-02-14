export type TripPhase = 'PRE_TRIP' | 'DEPARTURE_DAY' | 'ON_TRIP' | 'RETURN_DAY' | 'POST_TRIP';
export type ReminderType = 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'WEATHER' | 'SAFETY' | 'DOCUMENT' | 'PACKING' | 'BUDGET';
export type EventType = 'FLIGHT_DELAY' | 'FLIGHT_CANCEL' | 'WEATHER_ALERT' | 'ATTRACTION_CLOSED' | 'ROAD_CLOSURE' | 'EMERGENCY' | 'SCHEDULE_CONFLICT' | 'BUDGET_OVERRUN';
export type JourneyIntent = 'NEARBY_SEARCH' | 'SCHEDULE_QUERY' | 'NAVIGATION' | 'RECOMMENDATION' | 'EMERGENCY' | 'ADJUSTMENT' | 'GENERAL';
export interface Reminder {
    id: string;
    type: ReminderType;
    title: string;
    titleCN: string;
    message: string;
    messageCN: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    scheduledAt: string;
    relatedItemId?: string;
    actionRequired?: boolean;
    actions?: {
        action: string;
        label: string;
        labelCN: string;
    }[];
}
export interface TripEvent {
    id: string;
    type: EventType;
    title: string;
    titleCN: string;
    description: string;
    descriptionCN: string;
    severity: 'info' | 'warning' | 'critical';
    occurredAt: string;
    affectedItems: string[];
    source?: string;
    metadata?: Record<string, any>;
}
export interface EmergencyOption {
    id: string;
    name: string;
    nameCN: string;
    description: string;
    descriptionCN: string;
    impact: {
        time: string;
        cost: string;
        experience: string;
    };
    impactCN: {
        time: string;
        cost: string;
        experience: string;
    };
    recommended: boolean;
    actions: {
        action: string;
        label: string;
        labelCN: string;
        autoExecutable: boolean;
    }[];
}
export interface JourneyState {
    tripId: string;
    userId: string;
    phase: TripPhase;
    currentDay: number;
    totalDays: number;
    currentDate: string;
    currentLocation?: {
        lat: number;
        lng: number;
        name?: string;
    };
    todaySchedule: ScheduleItem[];
    upcomingReminders: Reminder[];
    activeEvents: TripEvent[];
    pendingDecisions: EmergencyOption[][];
    stats: {
        completedActivities: number;
        totalActivities: number;
        spentBudget: number;
        totalBudget: number;
    };
    lastUpdated: string;
}
export interface ScheduleItem {
    id: string;
    type: 'flight' | 'hotel' | 'activity' | 'transport' | 'meal' | 'rest';
    title: string;
    titleCN: string;
    startTime: string;
    endTime?: string;
    location?: {
        name: string;
        nameCN: string;
        lat: number;
        lng: number;
        address?: string;
    };
    status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled' | 'modified';
    notes?: string;
    notesCN?: string;
}
export interface JourneyAssistantRequest {
    tripId: string;
    userId: string;
    action: 'chat' | 'get_status' | 'get_reminders' | 'handle_event' | 'adjust_schedule';
    message?: string;
    language?: 'en' | 'zh';
    context?: {
        currentLocation?: {
            lat: number;
            lng: number;
        };
        timezone?: string;
    };
    eventId?: string;
    selectedOptionId?: string;
    adjustmentParams?: {
        itemId: string;
        newTime?: string;
        cancel?: boolean;
        replace?: {
            type: string;
            details: any;
        };
    };
}
export interface JourneyAssistantResponse {
    message?: string;
    messageCN?: string;
    journeyState?: JourneyState;
    reminders?: Reminder[];
    event?: TripEvent;
    options?: EmergencyOption[];
    adjustmentResult?: {
        success: boolean;
        message: string;
        messageCN: string;
        updatedSchedule?: ScheduleItem[];
    };
    searchResults?: {
        type: string;
        items: any[];
    };
    suggestedActions?: {
        action: string;
        label: string;
        labelCN: string;
    }[];
}
export interface PushNotification {
    userId: string;
    tripId: string;
    type: 'reminder' | 'event' | 'update';
    title: string;
    titleCN: string;
    body: string;
    bodyCN: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    data?: Record<string, any>;
    scheduledAt?: string;
    sentAt?: string;
}
