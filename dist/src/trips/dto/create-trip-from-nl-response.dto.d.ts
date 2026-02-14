import { ClarificationQuestion } from '../../agent/interfaces/clarification.interface';
export type PlannerResponseBlockType = 'paragraph' | 'heading' | 'list' | 'summary_card' | 'question_card' | 'highlight' | 'budget_summary' | 'itinerary_overview';
export declare class SummaryCardDto {
    destination?: string;
    duration?: string;
    travelers?: string;
    budget?: BudgetInfoDto;
}
export declare class BudgetInfoDto {
    amount: number;
    currency: string;
    details?: string[];
}
export declare class BudgetSummaryDto {
    estimatedAmount: number;
    currency: string;
    duration: string;
    travelers: string;
    breakdown?: Array<{
        category: string;
        amount: number;
        percentage?: number;
    }>;
}
export declare class ItineraryOverviewDto {
    theme?: string;
    route?: string;
    dailyStructure?: string;
}
export declare class PlannerResponseBlockDto {
    type: PlannerResponseBlockType;
    id?: string;
    content?: string;
    level?: 1 | 2 | 3;
    text?: string;
    title?: string;
    items?: string[];
    ordered?: boolean;
    summary?: SummaryCardDto;
    questionId?: string;
    highlightText?: string;
    highlightType?: 'info' | 'warning' | 'success';
    budget?: BudgetSummaryDto;
    itinerary?: ItineraryOverviewDto;
}
export declare class ClarificationQuestionDto implements ClarificationQuestion {
    id: string;
    question: string;
    type: 'text' | 'single_choice' | 'multi_choice' | 'date' | 'number';
    options?: string[];
    required: boolean;
    placeholder?: string;
    hint?: string;
    default?: string | string[];
    metadata?: {
        category?: string;
        priority?: 'high' | 'medium' | 'low';
    };
    group?: 'required' | 'optional';
    conditionalInputs?: Array<{
        triggerValue: string;
        inputType: 'text' | 'date' | 'number' | 'date_range';
        label?: string;
        placeholder?: string;
        required?: boolean;
        validation?: {
            min?: number;
            max?: number;
            pattern?: string;
        };
        hint?: string;
    }>;
}
export declare class CreateTripFromNLResponseDto {
    sessionId?: string;
    needsClarification?: boolean;
    plannerResponseBlocks?: PlannerResponseBlockDto[];
    plannerReply?: string;
    clarificationQuestions?: ClarificationQuestionDto[];
    suggestedQuestions?: string[];
    conversationContext?: Record<string, any>;
    partialParams?: any;
    trip?: any;
    generatingItems?: boolean;
    message?: string;
    hotelRecommendations?: Array<{
        hotelId: number;
        name: string;
        roomRate: number;
        tier: number;
        locationScore?: {
            center_distance_km?: number;
            nearest_station_walk_min?: number;
            is_transport_hub?: boolean;
            avg_distance_to_attractions_km?: number;
            transport_convenience_score?: number;
        };
        totalCost?: number;
        costBreakdown?: {
            roomRate: number;
            transportCost: number;
            timeCost: number;
            hiddenCost: number;
            totalCost: number;
        };
        recommendationReason: string;
        distanceToCenter?: number;
    }>;
    personaInfo?: {
        personaId: string;
        personaName: string;
        personaNameEn?: string;
        confidence: number;
        matchReasons: string[];
    };
    recommendedRoutes?: Array<{
        route: string;
        reason: string;
        difficultyMatch: string;
        season?: string;
        prerequisites?: string[];
    }>;
    blockedBySafetyPrinciple?: boolean;
    decisionResult?: {
        decision: 'GO_FULLY_SUPPORTED' | 'GO_WITH_STRONG_CAUTION' | 'GO_ALTERNATIVE_PLAN' | 'STRONGLY_RECONSIDER' | 'NOT_RECOMMENDED';
        reason: string;
        recommendations: string[];
    };
    blockedByDecisionMatrix?: boolean;
    lastMessageId?: string;
}
