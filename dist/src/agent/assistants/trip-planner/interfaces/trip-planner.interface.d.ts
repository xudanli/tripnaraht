export type TripPlannerIntent = 'OPTIMIZE_ROUTE' | 'REPLACE_POI' | 'ADJUST_PACE' | 'REBALANCE_DAYS' | 'ADD_ACTIVITY' | 'ARRANGE_MEALS' | 'PLAN_TRANSPORT' | 'FILL_FREE_TIME' | 'ADD_HOTEL' | 'ASK_QUESTION' | 'GET_SUGGESTION' | 'CHECK_FEASIBILITY' | 'COMPARE_OPTIONS' | 'CREATE_CHECKLIST' | 'SET_REMINDER' | 'EXPORT_ITINERARY' | 'SHARE_TRIP' | 'GENERAL_CHAT' | 'SHOW_OVERVIEW' | 'UNDO_CHANGE';
export type TripPlannerPhase = 'OVERVIEW' | 'OPTIMIZING' | 'DETAILING' | 'CONSULTING' | 'EXECUTING' | 'CONFIRMING';
export interface TripContext {
    tripId: string;
    destination: string;
    destinationName?: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    totalBudget: number;
    remainingBudget?: number;
    travelers: {
        adults: number;
        children: number;
        elderly: number;
        childrenAges?: number[];
    };
    pacingConfig: {
        level: 'RELAXED' | 'STANDARD' | 'TIGHT';
        maxDailyActivities: number;
    };
    days: TripDayContext[];
    preferences?: {
        style?: string;
        interests?: string[];
        pace?: string;
        mustPlaces?: string[];
        avoidPlaces?: string[];
    };
    status: string;
    completeness: number;
}
export interface TripDayContext {
    dayId: string;
    dayNumber: number;
    date: string;
    theme?: string;
    city?: string;
    items: TripItemContext[];
    stats: {
        itemCount: number;
        totalDuration: number;
        totalCost: number;
        freeTime: number;
        travelTime: number;
    };
    issues?: string[];
}
export interface TripItemContext {
    itemId: string;
    type: 'POI' | 'RESTAURANT' | 'TRANSPORT' | 'HOTEL' | 'ACTIVITY' | 'FREE_TIME';
    name: string;
    nameCN?: string;
    startTime?: string;
    endTime?: string;
    duration?: number;
    cost?: number;
    address?: string;
    notes?: string;
    location?: {
        lat: number;
        lng: number;
    };
    cityName?: string;
    poiId?: string;
    category?: string;
    rating?: number;
    transportType?: string;
    from?: string;
    to?: string;
}
export interface TripPlannerState {
    sessionId: string;
    tripId: string;
    userId: string;
    phase: TripPlannerPhase;
    tripContext: TripContext;
    messages: TripPlannerMessage[];
    pendingChanges?: PendingChange[];
    createdAt: string;
    updatedAt: string;
}
export interface TripPlannerMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    intent?: TripPlannerIntent;
    richContent?: {
        type: 'day_overview' | 'poi_card' | 'comparison' | 'checklist' | 'map';
        data: any;
    };
    quickActions?: QuickAction[];
    timestamp: string;
}
export interface QuickAction {
    id: string;
    label: string;
    action: string;
    params?: Record<string, any>;
    style?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
}
export interface PendingChange {
    id: string;
    type: 'ADD' | 'UPDATE' | 'DELETE' | 'REORDER';
    target: 'TRIP' | 'DAY' | 'ITEM';
    targetId?: string;
    dayNumber?: number;
    description: string;
    status?: 'pending' | 'applied' | 'cancelled';
    before?: any;
    after?: any;
    impact?: {
        budgetDelta?: number;
        timeDelta?: number;
        riskLevel?: 'low' | 'medium' | 'high';
    };
}
export interface TripPlannerRequest {
    sessionId?: string;
    tripId: string;
    userId: string;
    message: string;
    targetDay?: number;
    targetItemId?: string;
    context?: {
        currentLocation?: {
            lat: number;
            lng: number;
        };
        currentTime?: string;
        selectedItems?: string[];
        action?: string;
        category?: string;
        destination?: string;
        sources?: any[];
    };
    clarificationData?: {
        selectedAction?: 'QUERY' | 'ADD_TO_ITINERARY' | 'REPLACE' | 'REMOVE' | 'MODIFY';
        params?: {
            dayNumber?: number;
            timeSlot?: {
                start: string;
                end: string;
            };
            targetItemId?: string;
            gapId?: string;
        };
    };
}
export interface TripPlannerResponse {
    sessionId: string;
    message: string;
    phase: TripPlannerPhase;
    intent: TripPlannerIntent;
    richContent?: {
        type: 'day_overview' | 'poi_card' | 'poi_list' | 'comparison' | 'checklist' | 'map' | 'timeline' | 'guardian_panel' | 'gap_highlight' | 'rag_sources' | 'evidence_chain' | 'related_questions';
        data: any;
    };
    quickActions?: QuickAction[];
    pendingChanges?: PendingChange[];
    personaInsights?: PersonaInsight[];
    guardianEvaluation?: GuardianEvaluation;
    tripUpdate?: {
        changed: boolean;
        summary?: string;
        affectedDays?: number[];
    };
    followUp?: {
        question: string;
        options?: string[];
        type: 'single' | 'multiple' | 'text' | 'confirm';
    };
    disclaimer?: Disclaimer;
    ragResults?: {
        sources: Array<{
            id: string;
            title: string;
            content: string;
            source?: string;
            score: number;
            relevance: 'HIGH' | 'MEDIUM' | 'LOW';
        }>;
        evidenceChain?: Array<{
            step: number;
            description: string;
            sourceId: string;
        }>;
    };
    meta?: {
        processingTime?: number;
        guardiansInvoked?: GuardianPersona[];
        uncertainty?: IntentUncertainty;
        detectedGaps?: ResponseItineraryGap[];
        source?: 'RAG' | 'RAG+LLM' | 'LLM';
        ragConfidence?: number;
    };
}
export type IntentUncertainty = 'CLEAR' | 'AMBIGUOUS_ACTION' | 'AMBIGUOUS_TARGET' | 'AMBIGUOUS_NEED' | 'MULTIPLE_INTENTS';
export interface ResponseItineraryGap {
    id: string;
    type: 'MEAL' | 'HOTEL' | 'TRANSPORT' | 'ACTIVITY' | 'FREE_TIME';
    dayNumber: number;
    timeSlot: {
        start: string;
        end: string;
    };
    description: string;
    severity: 'CRITICAL' | 'SUGGESTED' | 'OPTIONAL';
    context?: {
        beforeItem?: string;
        afterItem?: string;
        nearbyLocation?: string;
    };
}
export interface TripPlannerPersona {
    name: string;
    role: string;
    tone: string;
    expertise: string[];
    greetingTemplate: string;
}
export type GuardianPersona = 'Abu' | 'DrDre' | 'Neptune';
export interface PersonaInsight {
    persona: GuardianPersona;
    emoji: string;
    name: string;
    role: string;
    severity: 'info' | 'warning' | 'error' | 'success';
    message: string;
    suggestion?: string;
    details?: string[];
}
export interface GuardianEvaluation {
    abu?: {
        passed: boolean;
        issues: string[];
        risks: Array<{
            type: string;
            severity: 'low' | 'medium' | 'high';
            description: string;
        }>;
    };
    drDre?: {
        sustainable: boolean;
        fatigueLevel: number;
        issues: string[];
        paceRecommendation: 'slow_down' | 'ok' | 'can_add_more';
    };
    neptune?: {
        hasAlternatives: boolean;
        alternatives: Array<{
            original: string;
            replacement: string;
            reason: string;
            impact: string;
        }>;
    };
}
export declare const GUARDIAN_PERSONAS: Record<GuardianPersona, {
    emoji: string;
    name: string;
    nameCN: string;
    role: string;
    roleCN: string;
    tone: string;
    catchphrase: string;
}>;
export declare const GUARDIAN_PRIORITY: Record<GuardianPersona, number>;
export interface Disclaimer {
    type: 'user_override_safety' | 'data_incomplete' | 'llm_fallback' | 'general';
    message: string;
    timestamp: string;
    relatedPersona?: GuardianPersona;
    userAction?: 'ignored' | 'acknowledged' | 'overridden';
}
export type GuardianTrackingEventType = 'guardian.invoked' | 'guardian.insight_shown' | 'guardian.suggestion_accepted' | 'guardian.suggestion_rejected' | 'guardian.warning_ignored' | 'guardian.evaluation_timeout' | 'guardian.fallback_used';
export interface GuardianTrackingEvent {
    eventType: GuardianTrackingEventType;
    timestamp: string;
    sessionId: string;
    tripId: string;
    userId: string;
    traceId?: string;
}
export interface GuardianInvokedEvent extends GuardianTrackingEvent {
    eventType: 'guardian.invoked';
    data: {
        guardiansInvoked: GuardianPersona[];
        triggerReason: 'keyword' | 'threshold' | 'intent' | 'all_guardians';
        intent: TripPlannerIntent;
        message: string;
    };
}
export interface GuardianInsightShownEvent extends GuardianTrackingEvent {
    eventType: 'guardian.insight_shown';
    data: {
        persona: GuardianPersona;
        severity: 'info' | 'warning' | 'error' | 'success';
        insightId: string;
        messagePreview: string;
    };
}
export interface GuardianSuggestionAcceptedEvent extends GuardianTrackingEvent {
    eventType: 'guardian.suggestion_accepted';
    data: {
        persona: GuardianPersona;
        suggestionType: 'route_change' | 'poi_replace' | 'pace_adjust' | 'time_change';
        changeId: string;
        acceptedAfterMs: number;
    };
}
export interface GuardianSuggestionRejectedEvent extends GuardianTrackingEvent {
    eventType: 'guardian.suggestion_rejected';
    data: {
        persona: GuardianPersona;
        suggestionType: string;
        reason?: string;
        rejectedAfterMs: number;
    };
}
export interface GuardianWarningIgnoredEvent extends GuardianTrackingEvent {
    eventType: 'guardian.warning_ignored';
    data: {
        persona: GuardianPersona;
        severity: 'warning' | 'error';
        warningType: string;
        ignoredMessage: string;
        disclaimerShown: boolean;
    };
}
export type GuardianTrackingEventUnion = GuardianInvokedEvent | GuardianInsightShownEvent | GuardianSuggestionAcceptedEvent | GuardianSuggestionRejectedEvent | GuardianWarningIgnoredEvent;
export declare const DEFAULT_PLANNER_PERSONA: TripPlannerPersona;
