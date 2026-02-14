import { DecisionDraft, LLMCall, SkillCall, DecisionDebugInfo } from '../interfaces/decision-draft.interface';
export interface DecisionDraftTrace {
    trace_id: string;
    draft_id: string;
    plan_id: string;
    request_id: string;
    start_time: string;
    end_time?: string;
    duration_ms?: number;
    stages: TraceStage[];
    llm_calls: LLMCall[];
    skill_calls: SkillCall[];
    errors?: Array<{
        stage: string;
        error: string;
        timestamp: string;
    }>;
}
export interface TraceStage {
    stage_name: string;
    start_time: string;
    end_time?: string;
    duration_ms?: number;
    decision_steps_generated?: number;
    step_drafts_generated?: number;
    llm_call_ids?: string[];
    skill_call_ids?: string[];
}
export interface DecisionDraftMetrics {
    performance: {
        total_generation_time_ms: number;
        avg_step_generation_time_ms: number;
        llm_calls_count: number;
        skill_calls_count: number;
        total_cost_usd: number;
        total_tokens: number;
    };
    quality: {
        decision_steps_count: number;
        avg_confidence: number;
        evidence_coverage: number;
        guardian_review_coverage: number;
    };
    success: {
        success_rate: number;
        fallback_rate: number;
        error_rate: number;
    };
}
export declare class DecisionDraftObservabilityService {
    private readonly logger;
    private traces;
    private activeTraces;
    startTrace(draftId: string, planId: string, requestId: string): string;
    endTrace(traceId: string, success?: boolean): DecisionDraftTrace | null;
    startStage(traceId: string, stageName: string): void;
    endStage(traceId: string, stageName: string, metadata?: {
        decision_steps_generated?: number;
        step_drafts_generated?: number;
        llm_call_ids?: string[];
        skill_call_ids?: string[];
    }): void;
    recordLLMCall(traceId: string, call: {
        model: string;
        prompt_tokens: number;
        completion_tokens: number;
        cost_usd: number;
        duration_ms: number;
        prompt?: string;
        response?: string;
    }): string;
    recordSkillCall(traceId: string, skillName: string, durationMs: number, success: boolean, parameters?: any, response?: any): string;
    recordError(traceId: string, stage: string, error: string): void;
    getTrace(traceId: string): DecisionDraftTrace | null;
    getActiveTraceId(requestId: string): string | null;
    calculateMetrics(trace: DecisionDraftTrace, decisionDraft: DecisionDraft): DecisionDraftMetrics;
    buildDebugInfo(trace: DecisionDraftTrace, metrics: DecisionDraftMetrics): DecisionDebugInfo;
}
