import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { PlanTask, ReplanResult, ContextSummary } from './types';
export declare class ReplannerService {
    private readonly llmService?;
    private readonly logger;
    constructor(llmService?: LlmService);
    createInitialPlan(userGoal: string, context: ContextSummary): Promise<PlanTask[]>;
    replan(userGoal: string, currentPlan: PlanTask[], memory: Record<string, any>, provider?: LlmProvider): Promise<ReplanResult>;
    private normalizePlan;
    private calculateChanges;
    private createSimplePlan;
}
