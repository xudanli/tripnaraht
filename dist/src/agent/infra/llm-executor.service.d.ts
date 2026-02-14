import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { TokenStatsService } from '../services/token-stats.service';
import { SubAgentType, OrchestrationStep } from '../interfaces/trip-plan.interface';
export interface LLMBudget {
    maxTokens: number;
    maxDurationMs: number;
    priority: 'low' | 'normal' | 'high' | 'critical';
}
export interface LLMCallOptions {
    budget?: Partial<LLMBudget>;
    provider?: LlmProvider;
    schema?: object;
    temperature?: number;
    fallbackTemplate?: string;
    traceId?: string;
    caller?: string;
    context?: {
        sub_agent?: SubAgentType;
        state_machine_step?: OrchestrationStep;
        task_type?: string;
        request_id?: string;
    };
}
export interface LLMCallResult<T = string> {
    success: boolean;
    result?: T;
    error?: string;
    metrics: {
        provider: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        durationMs: number;
        retryCount: number;
        fallbackUsed: boolean;
    };
    budgetStatus: {
        tokensUsed: number;
        tokensRemaining: number;
        timeUsed: number;
        timeRemaining: number;
        exceeded: boolean;
    };
}
export declare class LLMExecutorService {
    private readonly llmService?;
    private readonly tokenStatsService?;
    private readonly logger;
    private callStats;
    constructor(llmService?: LlmService, tokenStatsService?: TokenStatsService);
    execute(prompt: string, options?: LLMCallOptions): Promise<LLMCallResult<string>>;
    executeWithSchema<T>(prompt: string, schema: object, options?: LLMCallOptions): Promise<LLMCallResult<T>>;
    getBudgetForCaller(caller: string): LLMBudget;
    getStats(): {
        successRate: string;
        averageTokens: number;
        averageDurationMs: number;
        totalCalls: number;
        successfulCalls: number;
        failedCalls: number;
        fallbackCalls: number;
        totalTokens: number;
        totalDurationMs: number;
    };
    private resolveBudget;
    private callLLMWithTimeout;
    private handleFallback;
    private extractJSON;
    private generateTraceId;
    private sleep;
    private recordTokenUsage;
    private inferSubAgentFromCaller;
    private inferStepFromCaller;
    private inferTaskTypeFromCaller;
    private getModelName;
}
