import { LlmService } from '../../../llm/services/llm.service';
import { GatePrecheckConfig, GatePrecheckResult } from '../config/destination-clarification.config';
export declare class GatePrecheckService {
    private readonly llmService?;
    private readonly logger;
    constructor(llmService?: LlmService);
    executePrechecks(prechecks: GatePrecheckConfig[], currentParams: Record<string, any>, destinationCode: string): Promise<GatePrecheckResult>;
    private normalizeSeasonFromDate;
    private calculateSeasonFromDate;
    private checkTriggerConditions;
    private evaluateFieldCondition;
    private executeCheck;
    private executeLLMCheck;
    private buildLLMPrompt;
    private evaluateRuleExpression;
}
