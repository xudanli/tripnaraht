export declare class LocationDto {
    lat: number;
    lng: number;
    name?: string;
}
export declare class JourneyContextDto {
    currentLocation?: LocationDto;
    timezone?: string;
}
export declare class AdjustmentParamsDto {
    itemId: string;
    newTime?: string;
    cancel?: boolean;
    replace?: {
        type: string;
        details: any;
    };
}
export declare class JourneyBaseRequestDto {
    tripId: string;
    userId: string;
    language?: 'en' | 'zh';
    context?: JourneyContextDto;
}
export declare class JourneyChatRequestDto extends JourneyBaseRequestDto {
    message: string;
}
export declare class HandleEventRequestDto extends JourneyBaseRequestDto {
    eventId: string;
    selectedOptionId?: string;
}
export declare class AdjustScheduleRequestDto extends JourneyBaseRequestDto {
    adjustmentParams: AdjustmentParamsDto;
}
export declare class ScheduleItemDto {
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
export declare class ReminderDto {
    id: string;
    type: string;
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
export declare class TripEventDto {
    id: string;
    type: string;
    title: string;
    titleCN: string;
    description: string;
    descriptionCN: string;
    severity: 'info' | 'warning' | 'critical';
    occurredAt: string;
    affectedItems: string[];
    source?: string;
}
export declare class EmergencyOptionDto {
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
export declare class JourneyStatsDto {
    completedActivities: number;
    totalActivities: number;
    spentBudget: number;
    totalBudget: number;
}
export declare class JourneyStateDto {
    tripId: string;
    userId: string;
    phase: string;
    currentDay: number;
    totalDays: number;
    currentDate: string;
    currentLocation?: LocationDto;
    todaySchedule: ScheduleItemDto[];
    upcomingReminders: ReminderDto[];
    activeEvents: TripEventDto[];
    stats: JourneyStatsDto;
    lastUpdated: string;
}
export declare class JourneySuggestedActionDto {
    action: string;
    label: string;
    labelCN: string;
}
export declare class AdjustmentResultDto {
    success: boolean;
    message: string;
    messageCN: string;
    updatedSchedule?: ScheduleItemDto[];
}
export declare class SearchResultsDto {
    type: string;
    items: any[];
}
export declare class JourneyAssistantResponseDto {
    message?: string;
    messageCN?: string;
    journeyState?: JourneyStateDto;
    reminders?: ReminderDto[];
    event?: TripEventDto;
    options?: EmergencyOptionDto[];
    adjustmentResult?: AdjustmentResultDto;
    searchResults?: SearchResultsDto;
    suggestedActions?: JourneySuggestedActionDto[];
}
