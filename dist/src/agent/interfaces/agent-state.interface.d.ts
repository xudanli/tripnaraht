export interface AgentState {
    request_id: string;
    user_input: string;
    trip: {
        trip_id: string | null;
        days: number;
        day_boundaries: Array<{
            start: string;
            end: string;
        }>;
        lunch_break: {
            enabled: boolean;
            duration_min: number;
            window: [string, string];
        };
        pacing: 'relaxed' | 'normal' | 'tight';
    };
    tripInfo?: any;
    draft: {
        nodes: any[];
        hard_nodes: any[];
        soft_nodes: any[];
        edits: any[];
    };
    memory: {
        semantic_facts: {
            pois: any[];
            rules: Record<string, any>;
        };
        episodic_snippets: any[];
        user_profile: Record<string, any>;
        readiness?: {
            findings: any[];
            summary: {
                total_blockers: number;
                total_must: number;
                total_should: number;
                total_optional: number;
                total_risks: number;
            };
            constraints: any[];
            tasks: any[];
            checkedAt: string;
        };
    };
    compute: {
        clusters: any | null;
        time_matrix_api: number[][] | null;
        time_matrix_robust: number[][] | null;
        optimization_results: any[];
        robustness: any | null;
    };
    react: {
        step: number;
        max_steps: number;
        observations: any[];
        decision_log: Array<{
            step: number;
            chosen_action: string;
            reason_code: string;
            facts: Record<string, any>;
            policy_id: string;
        }>;
    };
    result: {
        status: 'DRAFT' | 'READY' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'FAILED' | 'TIMEOUT' | 'SUSPENDED';
        timeline: any[];
        dropped_items: any[];
        explanations: any[];
        suspensionInfo?: {
            approvalId: string;
            skillName: string;
            summary: string;
            payload: any;
        };
    };
    observability: {
        router_ms: number;
        latency_ms: number;
        tool_calls: number;
        browser_steps: number;
        cost_est_usd: number;
        fallback_used: boolean;
        planner_type?: 'llm' | 'rule_based';
    };
    llm_provider?: 'auto' | 'openai' | 'deepseek' | 'gemini' | 'anthropic';
}
