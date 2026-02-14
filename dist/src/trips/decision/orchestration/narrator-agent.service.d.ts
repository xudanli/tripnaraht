import { INarratorAgent, LangGraphState } from './langgraph-orchestrator.interface';
import { TripNaraCoreToolOutput } from '../tools/tripnara-core-tool.interface';
import { LlmService } from '../../../llm/services/llm.service';
import { ContextEngineerService } from '../../../agent/context-engine/services/context-engineer.service';
export declare class NarratorAgentService implements INarratorAgent {
    private readonly llmService?;
    private readonly contextEngineer?;
    private readonly logger;
    private readonly useLlm;
    constructor(llmService?: LlmService, contextEngineer?: ContextEngineerService);
    generateExplanation(coreToolOutput: TripNaraCoreToolOutput, state?: LangGraphState, complianceResult?: LangGraphState['complianceResult']): Promise<string>;
    private generateExplanationWithLlm;
    private generateRejectionExplanation;
    private generateSuccessExplanation;
    private getPersonaName;
    private generateSuggestion;
}
