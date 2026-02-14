import { IPlannerAgent, LangGraphState } from './langgraph-orchestrator.interface';
import { LlmService } from '../../../llm/services/llm.service';
import { ContextEngineerService } from '../../../agent/context-engine/services/context-engineer.service';
export declare class PlannerAgentService implements IPlannerAgent {
    private readonly llmService?;
    private readonly contextEngineer?;
    private readonly logger;
    private readonly useLlm;
    constructor(llmService?: LlmService, contextEngineer?: ContextEngineerService);
    analyzeQuery(state: LangGraphState): Promise<{
        intent: string;
        extractedParams: LangGraphState['extractedParams'];
        nextStep: 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT';
    }>;
    private analyzeQueryWithLlm;
    private analyzeQueryWithRules;
    private extractCountryCode;
    private extractMonth;
    private extractRouteDirectionKeywords;
    private extractHumanCapability;
    private extractSpecialConstraints;
    private inferIntent;
    private inferNextStep;
}
