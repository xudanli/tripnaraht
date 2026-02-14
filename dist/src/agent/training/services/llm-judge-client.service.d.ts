import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
export declare enum QualityDimension {
    SAFETY = "SAFETY",
    FEASIBILITY = "FEASIBILITY",
    RELEVANCE = "RELEVANCE",
    COMPLETENESS = "COMPLETENESS",
    CLARITY = "CLARITY",
    DECISION_QUALITY = "DECISION_QUALITY",
    TOOL_USAGE = "TOOL_USAGE"
}
export declare enum DiagnosticLabel {
    EVIDENCE_MISSING = "EVIDENCE_MISSING",
    HALLUCINATION_RISK = "HALLUCINATION_RISK",
    NOT_EXECUTABLE = "NOT_EXECUTABLE",
    SAFETY_CONCERN = "SAFETY_CONCERN",
    COMPLIANCE_ISSUE = "COMPLIANCE_ISSUE",
    TOOL_CALL_ERROR = "TOOL_CALL_ERROR",
    REASONING_WEAK = "REASONING_WEAK"
}
export interface PlanItem {
    day: number;
    activities: Record<string, any>[];
    summary?: string;
}
export interface DimensionScore {
    dimension: QualityDimension;
    score: number;
    reasoning: string;
}
export interface ScoreRequest {
    request_id: string;
    plan: PlanItem[];
    user_request: string;
    evidence?: Record<string, any>[];
    decision_log?: Record<string, any>[];
    context?: Record<string, any>;
}
export interface ScoreResponse {
    request_id: string;
    overall_score: number;
    dimension_scores: DimensionScore[];
    diagnostic_labels: DiagnosticLabel[];
    reasoning: string;
    suggestions: string[];
    latency_ms: number;
    timestamp: string;
    llm_provider: string;
}
export interface CompareRequest {
    request_id: string;
    plan_a: PlanItem[];
    plan_b: PlanItem[];
    user_request: string;
}
export interface CompareResponse {
    request_id: string;
    winner: 'A' | 'B' | 'TIE';
    score_a: number;
    score_b: number;
    reasoning: string;
    latency_ms: number;
    timestamp: string;
}
export interface LoraEvalRequest {
    request_id: string;
    prompt: string;
    baseline_response: string;
    lora_response: string;
    task_type?: string;
    ground_truth?: string;
}
export interface LoraEvalResponse {
    request_id: string;
    baseline_score: number;
    lora_score: number;
    winner: 'baseline' | 'lora' | 'tie';
    dimension_comparison: Record<string, {
        baseline: number;
        lora: number;
    }>;
    reasoning: string;
    recommendations: string[];
    latency_ms: number;
    timestamp: string;
}
export interface JudgeHealthStatus {
    status: string;
    service: string;
    version: string;
    llm_provider: string;
    has_anthropic_key: boolean;
    has_openai_key: boolean;
    vllm_url: string;
}
export declare class LlmJudgeClientService implements OnModuleInit {
    private readonly configService;
    private readonly httpService;
    private readonly logger;
    private readonly baseUrl;
    private readonly timeout;
    private isHealthy;
    constructor(configService: ConfigService, httpService: HttpService);
    onModuleInit(): Promise<void>;
    checkHealth(): Promise<JudgeHealthStatus | null>;
    isServiceHealthy(): boolean;
    scorePlan(request: ScoreRequest): Promise<ScoreResponse>;
    batchScore(requests: ScoreRequest[]): Promise<{
        responses: ScoreResponse[];
        total_latency_ms: number;
    }>;
    comparePlans(request: CompareRequest): Promise<CompareResponse>;
    evaluateLora(request: LoraEvalRequest): Promise<LoraEvalResponse>;
    batchEvaluateLora(requests: LoraEvalRequest[]): Promise<LoraEvalResponse[]>;
    generateLoraEvalReport(evalResults: LoraEvalResponse[]): Promise<{
        total_evaluations: number;
        lora_wins: number;
        baseline_wins: number;
        ties: number;
        average_lora_score: number;
        average_baseline_score: number;
        win_rate: number;
        dimension_comparison: Record<string, {
            avg_baseline: number;
            avg_lora: number;
        }>;
        recommendations: string[];
    }>;
}
