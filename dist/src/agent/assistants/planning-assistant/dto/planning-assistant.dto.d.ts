export declare class LocationContextDto {
    lat?: number;
    lng?: number;
}
export declare class RequestContextDto {
    currentLocation?: LocationContextDto;
    timezone?: string;
    tripId?: string;
    countryCode?: string;
}
export declare class PlanningChatRequestDto {
    sessionId: string;
    userId?: string;
    message: string;
    language?: 'en' | 'zh';
    context?: RequestContextDto;
}
export declare class CreateSessionRequestDto {
    userId?: string;
}
export declare class CreateSessionResponseDto {
    sessionId: string;
}
export declare class GuidingQuestionDto {
    question: string;
    questionCN: string;
    options?: string[];
    optionsCN?: string[];
    type: 'single' | 'multiple' | 'text' | 'date' | 'number';
}
export declare class DestinationRecommendationDto {
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
export declare class PlanCandidateDto {
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
}
export declare class SuggestedActionDto {
    action: string;
    label: string;
    labelCN: string;
}
export declare class PlanningChatResponseDto {
    message: string;
    messageCN: string;
    phase: string;
    guidingQuestions?: GuidingQuestionDto[];
    recommendations?: DestinationRecommendationDto[];
    planCandidates?: PlanCandidateDto[];
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
    suggestedActions?: SuggestedActionDto[];
}
export declare class SessionStateResponseDto {
    sessionId: string;
    userId?: string;
    phase: string;
    preferences: any;
    recommendations?: DestinationRecommendationDto[];
    selectedDestination?: string;
    planCandidates?: PlanCandidateDto[];
    selectedPlanId?: string;
    confirmedTripId?: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
}
