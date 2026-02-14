import { LlmService } from '../../llm/services/llm.service';
import { AgentState } from '../interfaces/agent-state.interface';
import { ActionRegistryService } from './action-registry.service';
import { TripNaraSystemPromptService } from './tripnara-system-prompt.service';
export declare class LlmPlanService {
    private llmService;
    private actionRegistry;
    private systemPromptService?;
    private readonly logger;
    private readonly enabled;
    constructor(llmService: LlmService, actionRegistry: ActionRegistryService, systemPromptService?: TripNaraSystemPromptService);
    selectAction(state: AgentState): Promise<{
        name: string;
        input: any;
    } | null>;
    private buildPrompt;
    private cleanJsonResponse;
    private getProviderFromState;
}
