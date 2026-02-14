export interface RewardWeights {
    success_rate: number;
    satisfaction: number;
    cost: number;
    compliance_rate: number;
}
export interface RewardFunctionConfig {
    weights: RewardWeights;
    normalization: {
        success_rate_range: [number, number];
        satisfaction_range: [number, number];
        cost_range: [number, number];
        compliance_rate_range: [number, number];
    };
}
export interface RewardCalculationResult {
    total_reward: number;
    component_rewards: {
        success_rate_reward: number;
        satisfaction_reward: number;
        cost_reward: number;
        compliance_rate_reward: number;
    };
    metadata: {
        calculation_time: string;
        config_version: string;
    };
}
export interface GateConfig {
    safety_gate: {
        threshold: number;
        penalty: number;
        description: string;
    };
    compliance_gate: {
        threshold: number;
        penalty: number;
        description: string;
    };
    feasibility_gate: {
        threshold: number;
        penalty: number;
        description: string;
    };
}
export interface ExperienceWeights {
    satisfaction: number;
    diversity: number;
    cost_efficiency: number;
    novelty: number;
}
export interface GatedRewardConfig {
    gates: GateConfig;
    experience: ExperienceWeights;
    version: string;
}
export interface GatedRewardMetrics {
    safety_score: number;
    compliance_score: number;
    feasibility_score: number;
    satisfaction: number;
    diversity: number;
    cost_efficiency: number;
    novelty: number;
    evidence_coverage?: number;
    risk_disclosure?: boolean;
}
export type GateFailureType = 'SAFETY_GATE' | 'COMPLIANCE_GATE' | 'FEASIBILITY_GATE' | null;
export type RewardType = 'GATE_FAILURE' | 'USER_REJECTED' | 'FULL_SUCCESS';
export type PreferenceLabel = 'POSITIVE' | 'NEGATIVE' | null;
export interface GatedRewardResult {
    total_reward: number;
    gate_passed: boolean;
    gate_failure?: GateFailureType;
    trainable_for_dpo: boolean;
    trainable_for_ppo: boolean;
    reward_type: RewardType;
    preference_label?: PreferenceLabel;
    reason: string;
    experience_breakdown?: {
        satisfaction: number;
        diversity: number;
        cost_efficiency: number;
        novelty: number;
        base_score: number;
        preference_bonus?: number;
    };
    gate_scores?: {
        safety: number;
        compliance: number;
        feasibility: number;
    };
    metadata: {
        calculation_time: string;
        config_version: string;
    };
}
export interface TripNARAApprovalSignals {
    system_approval: {
        safety_pass: boolean;
        compliance_pass: boolean;
        feasibility_pass: boolean;
        evidence_sufficient: boolean;
        system_approved: boolean;
        rejection_reasons?: string[];
    };
    user_preference: {
        user_approved: boolean;
        satisfaction_rating?: number;
        preference_factors?: {
            route_appeal: number;
            pacing_comfort: number;
            poi_interest: number;
            cost_acceptability: number;
        };
        feedback_text?: string;
    };
}
export type UserActionType = 'ADOPT' | 'EDIT' | 'EXPORT' | 'ABANDON' | 'FEEDBACK';
export interface UserActionTracking {
    action_id: string;
    user_id?: string;
    request_id: string;
    plan_id?: string;
    decision_id?: string;
    action_type: UserActionType;
    timestamp: string;
    metadata: Record<string, any>;
}
export interface UserFeedback {
    feedback_id: string;
    user_id?: string;
    request_id: string;
    plan_id?: string;
    satisfaction?: number;
    comments?: string;
    issues?: string[];
    timestamp: string;
    metadata: Record<string, any>;
}
export interface FeedbackAnalysis {
    period_start: string;
    period_end: string;
    total_feedbacks: number;
    avg_satisfaction: number;
    action_distribution: Record<UserActionType, number>;
    common_issues: Array<{
        issue: string;
        count: number;
        percentage: number;
    }>;
    trends: {
        satisfaction_trend: 'INCREASING' | 'DECREASING' | 'STABLE';
        adoption_rate_trend: 'INCREASING' | 'DECREASING' | 'STABLE';
    };
}
export interface ABTestExperiment {
    experiment_id: string;
    name: string;
    description: string;
    variants: Array<{
        variant_id: string;
        name: string;
        model_version: string;
        traffic_percentage: number;
    }>;
    start_date: string;
    end_date?: string;
    status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
    success_metrics: string[];
    created_at: string;
}
export interface ABTestAssignment {
    experiment_id: string;
    variant_id: string;
    user_id?: string;
    request_id: string;
    assignment_method: 'CONSISTENT_HASH' | 'RANDOM';
    timestamp: string;
}
export interface ABTestResult {
    experiment_id: string;
    variant_results: Array<{
        variant_id: string;
        sample_size: number;
        success_rate: number;
        avg_reward: number;
        avg_latency_ms: number;
        error_rate: number;
    }>;
    statistical_significance: {
        p_value: number;
        is_significant: boolean;
        winner_variant_id?: string;
    };
    analysis_date: string;
}
export interface GradualRolloutPhase {
    phase: number;
    traffic_percentage: number;
    duration_days: number;
    success_criteria: {
        min_success_rate?: number;
        max_error_rate?: number;
        min_avg_reward?: number;
        max_avg_latency_ms?: number;
    };
}
export interface ExplainableOutput {
    summary: string;
    decision_process: {
        steps: Array<{
            step_name: string;
            decision: string;
            reasoning: string;
            confidence: number;
        }>;
    };
    evidence_chain: Array<{
        evidence_id: string;
        evidence_type: string;
        evidence_content: string;
        relevance: number;
    }>;
    visualization?: {
        type: 'DECISION_TREE' | 'EVIDENCE_GRAPH' | 'TIMELINE';
        data: Record<string, any>;
    };
    metadata: {
        model_version: string;
        trace_id: string;
        generated_at: string;
    };
}
