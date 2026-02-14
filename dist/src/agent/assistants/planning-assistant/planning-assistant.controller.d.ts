import { PlanningAssistantService } from './services/planning-assistant.service';
import { PlanningChatRequestDto, PlanningChatResponseDto, CreateSessionRequestDto, CreateSessionResponseDto, SessionStateResponseDto } from './dto/planning-assistant.dto';
export declare class PlanningAssistantController {
    private readonly planningAssistantService;
    constructor(planningAssistantService: PlanningAssistantService);
    createSession(dto: CreateSessionRequestDto): Promise<CreateSessionResponseDto>;
    chat(dto: PlanningChatRequestDto): Promise<PlanningChatResponseDto>;
    getSessionState(sessionId: string): Promise<SessionStateResponseDto | null>;
    quickRecommend(budget?: string, travelersCount?: string, preferredType?: string, countryCode?: string, durationDays?: string, travelStyle?: string, budgetLevel?: string, language?: 'en' | 'zh'): Promise<any>;
    getUserPreferences(userId: string): Promise<any>;
    clearUserPreferences(userId: string): Promise<{
        success: boolean;
    }>;
}
