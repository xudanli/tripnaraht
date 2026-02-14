export declare class SelectedContextDto {
    dayIndex?: number;
    date?: string;
    itemId?: string;
    placeName?: string;
    itemType?: 'ACTIVITY' | 'TRANSIT' | 'MEAL_ANCHOR' | 'MEAL_FLOATING' | 'REST';
}
export declare class AdjacentItemDto {
    name: string;
    endTime?: string;
    startTime?: string;
    type?: string;
}
export declare class AdjacentItemsDto {
    prevItem?: AdjacentItemDto;
    nextItem?: AdjacentItemDto;
}
export declare class FreeSlotDto {
    start: string;
    end: string;
}
export declare class DayStatsDto {
    totalItems: number;
    hasMeal: boolean;
    hasTransit: boolean;
    freeSlots?: FreeSlotDto[];
}
export declare class CurrentLocationDto {
    lat: number;
    lng: number;
}
export declare class EnhancedContextDto {
    selectedContext?: SelectedContextDto;
    adjacentItems?: AdjacentItemsDto;
    dayStats?: DayStatsDto;
    currentLocation?: CurrentLocationDto;
    timezone?: string;
    language?: 'zh' | 'en';
}
export declare class TimeSlotDto {
    start: string;
    end: string;
}
export declare class ClarificationParamsDto {
    dayNumber?: number;
    timeSlot?: TimeSlotDto;
    targetItemId?: string;
    gapId?: string;
}
export declare class ClarificationDataDto {
    selectedAction?: 'QUERY' | 'ADD_TO_ITINERARY' | 'REPLACE' | 'REMOVE' | 'MODIFY';
    params?: ClarificationParamsDto;
}
export declare class StartTripPlannerSessionDto {
    tripId: string;
}
export declare class TripPlannerChatDto {
    tripId: string;
    message: string;
    sessionId?: string;
    targetDay?: number;
    targetItemId?: string;
    context?: EnhancedContextDto;
    clarificationData?: ClarificationDataDto;
}
export declare class TripPlannerActionDto {
    tripId: string;
    action: string;
    sessionId?: string;
    params?: Record<string, any>;
}
export declare class ConfirmChangesDto {
    tripId: string;
    sessionId: string;
    changeIds: string[];
}
export declare class SuggestionPlaceDto {
    name: string;
    nameCN?: string;
    placeId?: number;
    category?: string;
    address?: string;
}
export declare class ApplySuggestionDto {
    tripId: string;
    sessionId: string;
    suggestionId: string;
    targetDay: number;
    timeSlot?: TimeSlotDto;
    suggestionType: 'add_place' | 'modify_time' | 'add_meal' | 'optimize_route';
    place?: SuggestionPlaceDto;
}
