import { RouterOutputDto } from './router-output.dto';
import { ItineraryDay, DecisionLogEntry, OrchestratorState, Itinerary, GateResult, ItineraryItem, EvidenceRef, SimplifiedExplanation, AICapabilityDisplay } from '../interfaces/trip-plan.interface';
import { ErrorType } from '../interfaces/error-types.interface';
import { ClarificationQuestion } from '../interfaces/clarification.interface';
export declare class ConversationContextDto {
    recent_messages?: string[];
    locale?: string;
    timezone?: string;
}
export declare class AgentOptionsDto {
    dry_run?: boolean;
    allow_webbrowse?: boolean;
    max_seconds?: number;
    max_steps?: number;
    max_browser_steps?: number;
    cost_budget_usd?: number;
    llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';
    use_claude_orchestration?: boolean;
    use_state_machine_orchestration?: boolean;
    entry_point?: 'trip_detail_page' | 'trip_list_page' | 'dashboard' | 'planning_workbench';
    readonly_mode?: boolean;
}
export declare class RouteAndRunRequestDto {
    request_id: string;
    user_id: string;
    trip_id?: string | null;
    route_direction_id?: string | null;
    message: string;
    conversation_context?: ConversationContextDto;
    options?: AgentOptionsDto;
}
export declare class RouteAndRunResponseDto {
    request_id: string;
    route: RouterOutputDto;
    ui_state?: {
        phase: 'INTAKE' | 'RESEARCH' | 'GATE_EVAL' | 'PLAN_GEN' | 'VERIFY' | 'COMPLIANCE' | 'REPAIR' | 'NARRATE' | 'FEEDBACK' | 'DONE' | 'FAILED' | 'TIMEOUT' | 'HALLUCINATION_DETECTION';
        ui_status: 'thinking' | 'browsing' | 'verifying' | 'repairing' | 'awaiting_consent' | 'awaiting_confirmation' | 'done' | 'failed';
        progress_percent?: number;
        message?: string;
        requires_user_action?: boolean;
        estimated_time_remaining_ms?: number;
        current_step_detail?: string;
    };
    result: {
        status: 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT' | 'REDIRECT_REQUIRED';
        answer_text: string;
        payload: {
            timeline: ItineraryDay[];
            dropped_items: ItineraryItem[];
            candidates: any[];
            evidence: EvidenceRef[];
            robustness: number | null;
            orchestrationResult?: {
                state?: OrchestratorState;
                itinerary?: Itinerary;
                gate_result?: GateResult;
                decision_log?: DecisionLogEntry[];
            };
            redirectInfo?: {
                redirect_to: string;
                redirect_reason: 'READONLY_MODE_RESTRICTION' | 'PLANNING_REQUEST_DETECTED' | 'INSUFFICIENT_PERMISSIONS' | 'FEATURE_MIGRATED' | 'MISSING_TRIP_ID';
                original_request: {
                    message: string;
                    user_id: string;
                    trip_id?: string;
                };
            };
            needsUserConfirmation?: boolean;
            clarificationMessage?: string;
            clarificationQuestions?: ClarificationQuestion[];
            missingServices?: string[];
            solutions?: string[];
            errorType?: ErrorType;
        };
    };
    explain: {
        decision_log: DecisionLogEntry[];
        simplified_explanation?: SimplifiedExplanation;
        ai_capability_display?: AICapabilityDisplay;
    };
    observability: {
        latency_ms: number;
        router_ms: number;
        system_mode: 'SYSTEM1' | 'SYSTEM2' | 'REDIRECT';
        tool_calls: number;
        browser_steps: number;
        tokens_est: number;
        cost_est_usd: number;
        fallback_used: boolean;
        trace?: {
            orchestration: {
                resolved: {
                    mode: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
                    reason: string;
                    matchedRules: string[];
                };
                recommended?: {
                    useStateMachine?: boolean;
                    enableAudit?: boolean;
                    requireConsent?: boolean;
                    reason?: string;
                };
                signals?: {
                    taskType: string;
                    risk: string;
                    complexity: string;
                    needsAudit: boolean;
                    requiresStructuredOutput: boolean;
                    expectsToolCalls: boolean;
                    legacyWellSupported: boolean;
                    latencyBudgetMs: number;
                };
                flags?: {
                    env?: Record<string, any>;
                    options?: Record<string, any>;
                    derived?: Record<string, any>;
                };
            };
            timestamp: string;
            orchestration_mode?: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM';
            orchestration_recommended_sm?: boolean;
            risk?: string;
            task_type?: string;
            requires_consent?: boolean;
            max_seconds?: number;
            latency_budget_ms?: number;
            steps?: Array<{
                step_id: string;
                step_name: string;
                skill_name?: string;
                action_name?: string;
                success: boolean;
                duration_ms: number;
                evidence_refs?: string[];
            }>;
            evidence?: Array<{
                evidence_id: string;
                source: string;
                type: string;
                timestamp: string;
            }>;
        };
    };
}
