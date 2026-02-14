import { OrchestrationStep, SubAgentType, GuardianType, DecisionLogEntry, EvidenceRef } from '../../agent/interfaces/trip-plan.interface';
import { TripNARAWorkflowDraft } from '../../chain-of-work/interfaces/chain-of-work.interface';
export type DecisionType = 'transport-decision' | 'pace-decision' | 'poi-selection' | 'route-optimization' | 'weather-strategy' | 'budget-balance';
export type DecisionStepStatus = 'pending' | 'approved' | 'rejected' | 'modified';
export interface DecisionStepInput {
    name: string;
    value: any;
    source: 'user' | 'system' | 'inferred';
}
export interface DecisionStepOutput {
    name: string;
    value: any;
    confidence: number;
}
export type DecisionEvidence = EvidenceRef;
export interface GuardianReview {
    verdict: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    evidence: string[];
    explanation?: string;
    confidence?: number;
    reason_codes?: string[];
}
export interface UserFeedback {
    action: 'approve' | 'reject' | 'modify';
    reasoning?: string;
    modified_at: string;
}
export interface DecisionStep {
    id: string;
    title: string;
    description: string;
    type: DecisionType;
    status: DecisionStepStatus;
    confidence: number;
    inputs: DecisionStepInput[];
    outputs: DecisionStepOutput[];
    evidence: EvidenceRef[];
    decision_log: DecisionLogEntry[];
    step_draft_ids: string[];
    step_drafts?: any[];
    dependencies?: string[];
    orchestration_step?: OrchestrationStep;
    sub_agent?: SubAgentType;
    skills_used?: string[];
    guardian_review?: {
        abu?: GuardianReview;
        dr_dre?: GuardianReview;
        neptune?: GuardianReview;
    };
    user_feedback?: UserFeedback;
    created_at: string;
    updated_at: string;
}
export interface DecisionDraft {
    draft_id: string;
    plan_id: string;
    plan_version: number;
    workflow_id?: string;
    version?: string;
    decision_steps: DecisionStep[];
    step_draft_id?: string;
    step_draft?: TripNARAWorkflowDraft;
    execution_result_id?: string;
    execution_result?: any;
    user_mode: 'toc' | 'expert' | 'studio';
    debug_info?: DecisionDebugInfo;
    metadata: {
        decision_count: number;
        step_count: number;
        created_by: string;
        created_at: string;
        updated_at: string;
    };
}
export interface DecisionDraftGenerationConfig {
    model?: 'claude-3-5-sonnet' | 'gpt-4' | 'deepseek';
    temperature?: number;
    max_tokens?: number;
    user_mode?: 'toc' | 'expert' | 'studio';
}
export interface DecisionTypeMappingRule {
    decision_type: DecisionType;
    step_types: string[];
    required_skills: string[];
    sub_agent: string;
    guardian?: GuardianType;
}
export interface DecisionDraftVersion {
    version_id: string;
    plan_id: string;
    plan_version: number;
    workflow_id?: string;
    version?: string;
    decision_draft: DecisionDraft;
    step_draft: TripNARAWorkflowDraft;
    execution_result?: any;
    diff?: {
        decision_steps_added: DecisionStep[];
        decision_steps_removed: DecisionStep[];
        decision_steps_modified: DecisionStep[];
        step_drafts_added: any[];
        step_drafts_removed: any[];
        step_drafts_modified: any[];
    };
    created_by: string;
    description?: string;
    created_at: string;
}
export interface DecisionQualityMetrics {
    evidence_completeness: number;
    decision_consistency: number;
    user_satisfaction: number;
    explanation_click_rate: number;
    regeneration_count: number;
}
export interface LLMCall {
    call_id: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number;
    duration_ms: number;
    timestamp: string;
    prompt?: string;
    response?: string;
}
export interface SkillCall {
    skill_name: string;
    call_count: number;
    total_duration_ms: number;
    errors: number;
    parameters?: any;
    response?: any;
}
export interface PerformanceMetrics {
    generation_time_ms: number;
    execution_time_ms: number;
    success_rate: number;
    total_cost_usd: number;
    total_tokens: number;
}
export interface DecisionDebugInfo {
    llm_calls?: LLMCall[];
    skill_calls?: SkillCall[];
    performance_metrics?: PerformanceMetrics;
    execution_trace?: any;
}
export interface DecisionExplanation {
    decision_step: DecisionStep;
    step_drafts: any[];
    evidence_chain: EvidenceRef[];
    decision_log: DecisionLogEntry[];
    three_guardians_review?: {
        abu: GuardianReview;
        dr_dre: GuardianReview;
        neptune: GuardianReview;
    };
}
export interface StudioExplanation extends DecisionExplanation {
    llm_calls?: LLMCall[];
    skill_calls?: SkillCall[];
    performance_metrics?: PerformanceMetrics;
    optimization_suggestions?: string[];
}
