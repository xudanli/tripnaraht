import { PlannerAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { PlannerAgentService as LangGraphPlannerAgentService } from '../../../trips/decision/orchestration/planner-agent.service';
import { LlmService } from '../../../llm/services/llm.service';
export declare class ClaudePlannerAgentService implements PlannerAgent {
    private readonly langGraphPlanner?;
    private readonly llmService?;
    private readonly logger;
    constructor(langGraphPlanner?: LangGraphPlannerAgentService, llmService?: LlmService);
    analyzeRequest(request: TripPlanRequest, context: OrchestratorState): Promise<{
        intent: string;
        gaps: Array<{
            type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
            severity: 'HARD' | 'SOFT';
            detail: string;
        }>;
        candidate_structure?: {
            suggested_days: number;
            suggested_route?: string[];
            key_pois?: string[];
        };
    }>;
    private identifyGaps;
    private generateCandidateStructure;
    private convertToLangGraphState;
    private extractCountryCode;
}
