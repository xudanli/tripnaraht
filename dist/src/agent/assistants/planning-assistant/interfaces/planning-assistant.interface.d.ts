export type PlanningIntent = 'EXPLORE' | 'RECOMMEND' | 'COLLECT_INFO' | 'GENERATE_PLAN' | 'COMPARE' | 'ADJUST' | 'CONFIRM' | 'QUESTION' | 'GENERAL';
export type ConversationPhase = 'INITIAL' | 'EXPLORING' | 'RECOMMENDING' | 'PLANNING' | 'COMPARING' | 'ADJUSTING' | 'CONFIRMING' | 'COMPLETED';
export interface UserPreferences {
    travelers?: {
        adults?: number;
        children?: number;
        seniors?: number;
        childrenAges?: number[];
    };
    dateRange?: {
        startDate?: string;
        endDate?: string;
        flexible?: boolean;
        preferredMonths?: number[];
    };
    budget?: {
        total?: number;
        currency?: string;
        level?: 'low' | 'medium' | 'high' | 'luxury';
        flexible?: boolean;
    };
    destination?: {
        continents?: string[];
        countries?: string[];
        cities?: string[];
        exclude?: string[];
        type?: ('beach' | 'city' | 'nature' | 'culture' | 'adventure')[];
    };
    activities?: {
        preferred?: string[];
        avoid?: string[];
        pacePreference?: 'relaxed' | 'moderate' | 'intensive';
    };
    accommodation?: {
        type?: ('hotel' | 'resort' | 'hostel' | 'apartment' | 'villa')[];
        starRating?: number;
        style?: string[];
    };
    specialNeeds?: {
        accessibility?: boolean;
        dietaryRestrictions?: string[];
        medicalConditions?: string[];
        other?: string[];
    };
}
export interface DestinationRecommendation {
    id: string;
    countryCode: string;
    name: string;
    nameCN: string;
    description: string;
    descriptionCN: string;
    highlights: string[];
    highlightsCN: string[];
    matchScore: number;
    matchReasons: string[];
    matchReasonsCN: string[];
    estimatedBudget: {
        min: number;
        max: number;
        currency: string;
    };
    bestSeasons: string[];
    imageUrl?: string;
    tags: string[];
}
export interface PlanCandidate {
    id: string;
    name: string;
    nameCN: string;
    description: string;
    descriptionCN: string;
    destination: string;
    duration: number;
    highlights: string[];
    estimatedBudget: {
        total: number;
        breakdown: {
            flight: number;
            accommodation: number;
            activities: number;
            food: number;
            other: number;
        };
    };
    pace: 'relaxed' | 'moderate' | 'intensive';
    suitability: {
        score: number;
        reasons: string[];
    };
    warnings?: string[];
    skeleton?: any;
}
export interface PlanningConversationState {
    sessionId: string;
    userId?: string;
    phase: ConversationPhase;
    preferences: UserPreferences;
    recommendations?: DestinationRecommendation[];
    selectedDestination?: string;
    planCandidates?: PlanCandidate[];
    selectedPlanId?: string;
    confirmedTripId?: string;
    messageHistory: ConversationMessage[];
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
}
export interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    intent?: PlanningIntent;
    metadata?: Record<string, any>;
    timestamp: string;
}
export interface PlanningAssistantResponse {
    message: string;
    messageCN: string;
    phase: ConversationPhase;
    guidingQuestions?: {
        question: string;
        questionCN: string;
        options?: string[];
        optionsCN?: string[];
        type: 'single' | 'multiple' | 'text' | 'date' | 'number';
    }[];
    recommendations?: DestinationRecommendation[];
    planCandidates?: PlanCandidate[];
    comparison?: {
        dimensions: string[];
        candidates: {
            id: string;
            name: string;
            scores: Record<string, number>;
        }[];
        recommendation: string;
        recommendationCN: string;
    };
    confirmedTripId?: string;
    suggestedActions?: {
        action: string;
        label: string;
        labelCN: string;
    }[];
}
export interface PlanningAssistantRequest {
    sessionId: string;
    userId?: string;
    message: string;
    language?: 'en' | 'zh';
    countryCode?: string;
    context?: {
        currentLocation?: {
            lat: number;
            lng: number;
        };
        timezone?: string;
    };
}
