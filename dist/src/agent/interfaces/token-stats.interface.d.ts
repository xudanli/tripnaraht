import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SubAgentType, OrchestrationStep } from './trip-plan.interface';
export interface LLMCallTokenData {
    request_id: string;
    trace_id: string;
    span_id: string;
    sub_agent: SubAgentType;
    state_machine_step: OrchestrationStep;
    task_type: string;
    provider: LlmProvider;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    duration_ms: number;
    success: boolean;
    error?: string;
    timestamp: string;
}
export interface SubAgentTokenStats {
    sub_agent: SubAgentType;
    tokens: {
        total_prompt_tokens: number;
        total_completion_tokens: number;
        total_tokens: number;
        avg_prompt_tokens: number;
        avg_completion_tokens: number;
        avg_total_tokens: number;
        max_tokens: number;
        min_tokens: number;
    };
    calls: {
        total_calls: number;
        successful_calls: number;
        failed_calls: number;
        success_rate: number;
    };
    latency: {
        avg_latency_ms: number;
        p50_latency_ms: number;
        p90_latency_ms: number;
        p99_latency_ms: number;
        max_latency_ms: number;
    };
    time_range: {
        start_time: string;
        end_time: string;
        duration_hours: number;
    };
}
export interface TaskTypeTokenStats {
    task_type: string;
    state_machine_step: OrchestrationStep;
    tokens: {
        total_prompt_tokens: number;
        total_completion_tokens: number;
        total_tokens: number;
        avg_prompt_tokens: number;
        avg_completion_tokens: number;
        avg_total_tokens: number;
        max_tokens: number;
        min_tokens: number;
    };
    calls: {
        total_calls: number;
        successful_calls: number;
        failed_calls: number;
        success_rate: number;
    };
    latency: {
        avg_latency_ms: number;
        p50_latency_ms: number;
        p90_latency_ms: number;
        p99_latency_ms: number;
        max_latency_ms: number;
    };
    time_range: {
        start_time: string;
        end_time: string;
        duration_hours: number;
    };
}
export interface TimeSeriesTokenStats {
    time_bucket: string;
    time_granularity: 'hour' | 'day' | 'week' | 'month';
    tokens: {
        total_tokens: number;
        avg_tokens: number;
    };
    calls: {
        total_calls: number;
        successful_calls: number;
    };
    cost?: {
        total_cost: number;
        avg_cost: number;
    };
}
export interface ProviderTokenStats {
    provider: LlmProvider;
    tokens: {
        total_prompt_tokens: number;
        total_completion_tokens: number;
        total_tokens: number;
        avg_prompt_tokens: number;
        avg_completion_tokens: number;
        avg_total_tokens: number;
        max_tokens: number;
        min_tokens: number;
    };
    calls: {
        total_calls: number;
        successful_calls: number;
        failed_calls: number;
        success_rate: number;
    };
    latency: {
        avg_latency_ms: number;
        p50_latency_ms: number;
        p90_latency_ms: number;
        p99_latency_ms: number;
        max_latency_ms: number;
    };
    cost?: {
        total_cost: number;
        avg_cost_per_1k_tokens: number;
    };
    time_range: {
        start_time: string;
        end_time: string;
        duration_hours: number;
    };
}
export interface TokenStatsFilters {
    sub_agent?: SubAgentType;
    task_type?: string;
    provider?: LlmProvider;
    start_time?: Date;
    end_time?: Date;
    granularity?: 'hour' | 'day' | 'week' | 'month';
}
