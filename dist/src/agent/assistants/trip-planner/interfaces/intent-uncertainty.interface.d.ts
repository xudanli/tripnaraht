import { TripPlannerIntent } from './trip-planner.interface';
export type ItineraryGapType = 'MEAL' | 'ACTIVITY' | 'TRANSPORT' | 'HOTEL' | 'FREE_TIME';
export type GapSeverity = 'CRITICAL' | 'SUGGESTED' | 'OPTIONAL';
export interface ItineraryGap {
    id: string;
    type: ItineraryGapType;
    dayNumber: number;
    date: string;
    timeSlot: {
        start: string;
        end: string;
    };
    severity: GapSeverity;
    description: string;
    context: {
        beforeActivity?: {
            name: string;
            endTime: string;
        };
        afterActivity?: {
            name: string;
            startTime: string;
        };
        dayTheme?: string;
        dayCity?: string;
        existingCount: number;
    };
    suggestions?: string[];
}
export declare enum IntentUncertainty {
    CLEAR = "CLEAR",
    AMBIGUOUS_ACTION = "AMBIGUOUS_ACTION",
    AMBIGUOUS_TARGET = "AMBIGUOUS_TARGET",
    AMBIGUOUS_NEED = "AMBIGUOUS_NEED",
    MULTIPLE_INTENTS = "MULTIPLE_INTENTS"
}
export type ResolvedAction = 'QUERY' | 'ADD_TO_ITINERARY' | 'REPLACE' | 'REMOVE' | 'MODIFY' | 'EXECUTE';
export interface ClarificationOption {
    id: string;
    label: string;
    description?: string;
    action: ResolvedAction;
    params?: {
        dayNumber?: number;
        timeSlot?: {
            start: string;
            end: string;
        };
        targetItemId?: string;
        gapId?: string;
    };
    style?: 'primary' | 'secondary';
}
export interface ClarificationRequest {
    question: string;
    context?: string;
    options: ClarificationOption[];
    allowFreeText?: boolean;
}
export interface ContextDiscovery {
    foundGap: boolean;
    gap?: ItineraryGap;
    confidence: number;
    suggestion: string;
    shouldPrompt: boolean;
}
export interface DisambiguationResult {
    uncertainty: IntentUncertainty;
    confidence: number;
    originalIntent: TripPlannerIntent;
    resolvedIntent?: {
        action: ResolvedAction;
        intent?: TripPlannerIntent;
        target?: {
            dayNumber: number;
            timeSlot?: {
                start: string;
                end: string;
            };
            itemId?: string;
        };
    };
    clarificationNeeded?: ClarificationRequest;
    contextDiscovery?: ContextDiscovery;
    diagnostics?: {
        detectedKeywords: string[];
        explicitAction: 'QUERY' | 'ADD' | null;
        relatedGaps: ItineraryGap[];
        analysisPath: string[];
    };
}
export interface GapAnalysisConfig {
    detectMealGaps: boolean;
    detectActivityGaps: boolean;
    detectTransportGaps: boolean;
    detectHotelGaps: boolean;
    mealWindows: Array<{
        name: string;
        start: string;
        end: string;
        required: boolean;
    }>;
    minFreeTimeForGap: number;
    minActivityBuffer: number;
}
export declare const DEFAULT_GAP_ANALYSIS_CONFIG: GapAnalysisConfig;
export declare const KEYWORD_TO_GAP_TYPE: Record<string, ItineraryGapType>;
export declare const QUERY_KEYWORDS: string[];
export declare const ADD_KEYWORDS: string[];
