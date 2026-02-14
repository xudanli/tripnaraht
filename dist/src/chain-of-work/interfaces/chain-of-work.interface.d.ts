import { TripPlanRequest, OrchestratorState, OrchestrationStep, SubAgentType, GuardianType, GateResult, DecisionLogEntry } from '../../agent/interfaces/trip-plan.interface';
export interface TripNARAStepDraft {
    id: string;
    step_type: OrchestrationStep;
    title: string;
    description: string;
    status: 'draft' | 'modified' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
    priority: number;
    conditions?: string;
    sub_agent?: SubAgentType;
    guardian?: GuardianType;
    domain_agents?: string[];
    skills?: SkillMapping[] | string[];
    inputs?: string[];
    outputs?: string[];
    gate_result?: GateResult;
    decision_log_entry?: DecisionLogEntry;
    evidence_refs?: string[];
    version: number;
    created_at: string;
    updated_at: string;
}
export interface TripNARAWorkflowDraft {
    draft_id: string;
    workflow_id: string;
    version: string;
    steps: TripNARAStepDraft[];
    orchestration_mode: 'CLAUDE_SM' | 'CLAUDE_DYNAMIC' | 'LEGACY';
    trip_plan_request?: TripPlanRequest;
    orchestrator_state?: OrchestratorState;
    metadata: {
        step_count: number;
        skills_count: number;
        sub_agents_count: number;
        last_modified: string;
        created_by: string;
    };
    created_at: string;
    updated_at: string;
}
export interface SkillMapping {
    step_id: string;
    skill_name: string;
    confidence: number;
    matching_reason: string;
    input_mapping?: Record<string, string>;
    output_schema?: any;
}
export interface SubAgentMapping {
    step_id: string;
    sub_agent: SubAgentType;
    guardian?: GuardianType;
    prompt_template: string;
    output_schema?: any;
}
export interface ExecutionPlan {
    draft_id: string;
    workflow_id: string;
    version: string;
    steps: Array<{
        id: string;
        step_type: OrchestrationStep;
        sub_agent?: SubAgentType;
        skills?: string[];
        input_mapping: Record<string, string>;
        output_schema?: any;
        dependencies: string[];
        fallback_strategy?: {
            on_error: 'continue' | 'retry' | 'abort';
            retry_count?: number;
            fallback_skill?: string;
        };
    }>;
    parallel_groups: string[][];
}
export interface ExecutionResult {
    execution_id: string;
    draft_id: string;
    success: boolean;
    steps: Array<{
        step_id: string;
        status: 'completed' | 'failed' | 'skipped';
        output?: any;
        error?: string;
        duration_ms: number;
    }>;
    trace_info: ChainOfWorkTrace;
    total_duration_ms: number;
    total_cost_est_usd: number;
    error_message?: string;
}
export interface ChainOfWorkTrace {
    draft_id: string;
    workflow_id: string;
    version: string;
    steps: Array<{
        step_id: string;
        step_type: OrchestrationStep;
        status: 'pending' | 'running' | 'completed' | 'failed';
        start_time: string;
        end_time?: string;
        duration_ms?: number;
        sub_agent?: SubAgentType;
        skills_called?: string[];
        tool_calls?: number;
        cost_est_usd?: number;
        decision_log_entry_id?: string;
        output?: any;
        error?: string;
    }>;
    total_duration_ms: number;
    total_cost_est_usd: number;
    success: boolean;
}
export interface DraftGenerationConfig {
    model?: 'claude-3-5-sonnet' | 'gpt-4' | 'deepseek';
    temperature?: number;
    max_tokens?: number;
}
export interface DraftValidationResult {
    valid: boolean;
    errors: Array<{
        step_id: string;
        error_type: 'MISSING_SKILL' | 'INVALID_MAPPING' | 'ORDER_VIOLATION' | 'SCHEMA_MISMATCH';
        message: string;
        suggestion?: string;
    }>;
    warnings: Array<{
        step_id: string;
        warning_type: 'LOW_CONFIDENCE' | 'MISSING_FALLBACK' | 'PERFORMANCE_RISK';
        message: string;
    }>;
}
export interface Version {
    id: string;
    workflow_id: string;
    version: string;
    draft_data: TripNARAWorkflowDraft;
    status: 'draft' | 'published' | 'archived';
    is_current: boolean;
    creator: string;
    description?: string;
    created_at: string;
}
