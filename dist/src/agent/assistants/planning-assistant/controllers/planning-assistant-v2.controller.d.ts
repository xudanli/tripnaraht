import { PlanningAssistantV2Service } from '../services/planning-assistant-v2.service';
import { CreateSessionRequestDto } from '../dto/v2/create-session-request.dto';
import { CreateSessionResponseDto } from '../dto/v2/create-session-response.dto';
import { SessionStateResponseDto } from '../dto/v2/session-state-response.dto';
import { MessageHistoryResponseDto } from '../dto/v2/message-history-response.dto';
import { RecommendationsRequestDto } from '../dto/v2/recommendations-request.dto';
import { RecommendationsResponseDto } from '../dto/v2/recommendations-response.dto';
import { GeneratePlanRequestDto } from '../dto/v2/generate-plan-request.dto';
import { GeneratePlanResponseDto } from '../dto/v2/generate-plan-response.dto';
import { AsyncTaskResponseDto } from '../dto/v2/async-task-response.dto';
import { ComparePlansResponseDto } from '../dto/v2/compare-plans-response.dto';
import { OptimizePlanRequestDto } from '../dto/v2/optimize-plan-request.dto';
import { ConfirmPlanRequestDto } from '../dto/v2/confirm-plan-request.dto';
import { OptimizeTripRequestDto } from '../dto/v2/optimize-trip-request.dto';
import { RefineTripRequestDto } from '../dto/v2/refine-trip-request.dto';
import { TripSuggestionsResponseDto } from '../dto/v2/trip-suggestions-response.dto';
import { ChatRequestDto } from '../dto/v2/chat-request.dto';
import { ChatResponseDto } from '../dto/v2/chat-response.dto';
export declare class PlanningAssistantV2Controller {
    private readonly planningAssistantV2Service;
    constructor(planningAssistantV2Service: PlanningAssistantV2Service);
    createSession(dto: CreateSessionRequestDto): Promise<CreateSessionResponseDto>;
    getSessionState(sessionId: string, user?: {
        userId: string;
        email?: string;
    }): Promise<SessionStateResponseDto>;
    deleteSession(sessionId: string, user?: {
        userId: string;
        email?: string;
    }): Promise<{
        success: boolean;
        sessionId: string;
    }>;
    getMessageHistory(sessionId: string, limit?: number, offset?: number, user?: {
        userId: string;
        email?: string;
    }): Promise<MessageHistoryResponseDto>;
    chat(dto: ChatRequestDto): Promise<ChatResponseDto>;
    getRecommendations(naturalLanguage?: string, structuredParams?: RecommendationsRequestDto): Promise<RecommendationsResponseDto>;
    generatePlan(dto: GeneratePlanRequestDto, user?: {
        userId: string;
        email?: string;
    }): Promise<GeneratePlanResponseDto>;
    generatePlanAsync(dto: GeneratePlanRequestDto, user?: {
        userId: string;
        email?: string;
    }): Promise<AsyncTaskResponseDto>;
    getGenerateTaskStatus(taskId: string, user?: {
        userId: string;
        email?: string;
    }): Promise<AsyncTaskResponseDto>;
    comparePlans(planIds: string, compareFields?: string, sessionId?: string, language?: 'en' | 'zh', user?: {
        userId: string;
        email?: string;
    }): Promise<ComparePlansResponseDto>;
    optimizePlan(planId: string, dto: OptimizePlanRequestDto, user?: {
        userId: string;
        email?: string;
    }): Promise<GeneratePlanResponseDto>;
    confirmPlan(planId: string, dto: ConfirmPlanRequestDto, user?: {
        userId: string;
        email?: string;
    }): Promise<{
        success: boolean;
        tripId: string;
    }>;
    optimizeTrip(tripId: string, dto: OptimizeTripRequestDto, user?: {
        userId: string;
        email?: string;
    }): Promise<{
        success: boolean;
        tripId: string;
    }>;
    refineTrip(tripId: string, dto: RefineTripRequestDto, user?: {
        userId: string;
        email?: string;
    }): Promise<{
        success: boolean;
        tripId: string;
    }>;
    getTripSuggestions(tripId: string, user?: {
        userId: string;
        email?: string;
    }): Promise<TripSuggestionsResponseDto>;
}
