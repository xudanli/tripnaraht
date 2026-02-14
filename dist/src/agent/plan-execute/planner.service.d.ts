import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { ActionRegistryService } from '../services/action-registry.service';
import { PlanTask } from './types';
export declare class PlannerService {
    private readonly llmService?;
    private readonly actionRegistry?;
    private readonly logger;
    constructor(llmService?: LlmService, actionRegistry?: ActionRegistryService);
    generateDAGPlan(userGoal: string, context: string, provider?: LlmProvider): Promise<PlanTask[]>;
    private normalizeTasks;
    private validateDAG;
    private buildAvailableToolsSection;
    private createSimplePlan;
}
