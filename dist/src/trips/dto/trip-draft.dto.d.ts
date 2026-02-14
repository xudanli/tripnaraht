export declare enum TravelStyle {
    NATURE = "nature",
    CULTURE = "culture",
    FOOD = "food",
    CITYWALK = "citywalk",
    PHOTOGRAPHY = "photography",
    ADVENTURE = "adventure"
}
export declare enum IntensityLevel {
    RELAXED = "relaxed",
    BALANCED = "balanced",
    INTENSE = "intense"
}
export declare enum TransportMode {
    WALK = "walk",
    TRANSIT = "transit",
    CAR = "car"
}
export declare enum AccommodationBase {
    FIXED = "fixed",
    MOVING = "moving"
}
export declare enum HikingLevel {
    NONE = "none",
    LIGHT = "light",
    HIKING_HEAVY = "hiking-heavy"
}
export declare enum TimeSlot {
    MORNING = "morning",
    LUNCH = "lunch",
    AFTERNOON = "afternoon",
    DINNER = "dinner",
    EVENING = "evening"
}
export declare class TripConstraintsDto {
    withChildren?: boolean;
    withElderly?: boolean;
    earlyRiser?: boolean;
    dietaryRestrictions?: string[];
    avoidCategories?: string[];
}
export declare class CreateTripDraftDto {
    destination: string;
    days: number;
    style?: TravelStyle;
    intensity?: IntensityLevel;
    transport?: TransportMode;
    accommodationBase?: AccommodationBase;
    hikingLevel?: HikingLevel;
    constraints?: TripConstraintsDto;
    startDate?: string;
    endDate?: string;
}
export declare class DraftItineraryItemEvidence {
    openingHours?: string;
    distance?: number;
    rating?: number;
    source?: string;
}
export declare class DraftItineraryItem {
    placeId: number;
    slot: TimeSlot;
    startTime: string;
    endTime: string;
    reason: string;
    alternatives?: number[];
    evidence?: DraftItineraryItemEvidence;
}
export declare class DraftDaySlots {
    morning?: DraftItineraryItem;
    lunch?: DraftItineraryItem;
    afternoon?: DraftItineraryItem;
    dinner?: DraftItineraryItem;
    evening?: DraftItineraryItem;
}
export declare class DraftDay {
    day: number;
    date: string;
    slots: DraftDaySlots;
}
export declare class TripDraftMetadata {
    generationTime?: number;
    llmProvider?: string;
}
export declare class TripDraftResponseDto {
    destination: string;
    days: number;
    startDate?: string;
    endDate?: string;
    draftDays: DraftDay[];
    candidatesCount: number;
    validationWarnings?: string[];
    metadata?: TripDraftMetadata;
}
export declare class SaveTripDraftDto {
    draft: TripDraftResponseDto;
    userEdits?: {
        lockedItemIds?: string[];
        removedItems?: string[];
        addedItems?: DraftItineraryItem[];
    };
}
export declare class ReplaceItineraryItemDto {
    reason: 'too_tired' | 'weather_change' | 'change_style' | 'too_far' | 'closed' | 'other';
    preferredStyle?: TravelStyle;
    constraints?: {
        maxDistance?: number;
        mustBeOpen?: boolean;
        avoidCategories?: string[];
    };
}
export declare class ReplaceItineraryItemResponseDto {
    newItem: DraftItineraryItem;
    alternatives: Array<{
        placeId: number;
        placeName: string;
        reason: string;
        score: number;
    }>;
    replacedItem: {
        placeId: number;
        reason: string;
    };
}
export declare class RegenerateTripDto {
    lockedItemIds?: string[];
    newPreferences?: {
        style?: TravelStyle;
        intensity?: IntensityLevel;
        transport?: TransportMode;
        constraints?: TripConstraintsDto;
    };
}
export declare class RegenerateChangeItem {
    type: 'added' | 'removed' | 'replaced' | 'moved';
    itemId?: string;
    placeId: number;
    placeName: string;
    day: number;
    slot: TimeSlot;
    reason: string;
}
export declare class RegenerateTripResponseDto {
    updatedDraft: TripDraftResponseDto;
    changes: RegenerateChangeItem[];
}
