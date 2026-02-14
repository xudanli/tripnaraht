export interface TestCase {
    id: string;
    component: 'ROUTER' | 'GATE' | 'ITINERARY';
    input: Record<string, any>;
    expected_output?: Record<string, any>;
    metadata?: {
        country_code?: string;
        season?: string;
        complexity?: 'LOW' | 'MEDIUM' | 'HIGH';
        risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    };
}
export interface TestCaseResult {
    test_case_id: string;
    passed: boolean;
    actual_output: Record<string, any>;
    expected_output?: Record<string, any>;
    metrics: Record<string, number>;
    error?: string;
    latency_ms: number;
}
export interface RouterEvalResult {
    accuracy: number;
    coverage: number;
    latency_p50: number;
    latency_p95: number;
    latency_p99: number;
    error_rate: number;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    detailed_results: TestCaseResult[];
}
export interface GateEvalResult {
    precision: number;
    recall: number;
    false_positive_rate: number;
    false_negative_rate: number;
    accuracy: number;
    latency_p50: number;
    latency_p95: number;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    detailed_results: TestCaseResult[];
}
export interface ItineraryEvalResult {
    success_rate: number;
    avg_plan_length: number;
    avg_complexity: number;
    executability_score: number;
    user_satisfaction: number;
    avg_latency_ms: number;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    detailed_results: TestCaseResult[];
}
export interface FullPipelineEvalResult {
    router_result: RouterEvalResult;
    gate_result: GateEvalResult;
    itinerary_result: ItineraryEvalResult;
    end_to_end_success_rate: number;
    overall_score: number;
    total_tests: number;
    passed_tests: number;
}
export interface OPEResult {
    method: 'IS' | 'DR' | 'WDR';
    estimated_reward: number;
    confidence_interval: {
        lower: number;
        upper: number;
        confidence_level: number;
    };
    statistical_significance: {
        p_value: number;
        is_significant: boolean;
    };
    sample_size: number;
    baseline_reward?: number;
    improvement?: number;
    metadata: Record<string, any>;
}
export interface OPEReport {
    model_version: string;
    baseline_version?: string;
    evaluation_date: string;
    results: {
        is: OPEResult;
        dr: OPEResult;
        wdr: OPEResult;
    };
    recommendation: {
        should_deploy: boolean;
        confidence: 'HIGH' | 'MEDIUM' | 'LOW';
        reasoning: string;
    };
}
export interface ReplayComparisonResult {
    baseline_version: string;
    new_policy_version: string;
    comparison_metrics: {
        success_rate: {
            baseline: number;
            new_policy: number;
            improvement: number;
        };
        avg_reward: {
            baseline: number;
            new_policy: number;
            improvement: number;
        };
        avg_latency_ms: {
            baseline: number;
            new_policy: number;
            change: number;
        };
    };
    statistical_significance: {
        p_value: number;
        is_significant: boolean;
    };
    total_trajectories: number;
    detailed_results: Array<{
        trajectory_id: string;
        baseline_result: Record<string, any>;
        new_policy_result: Record<string, any>;
        difference: Record<string, number>;
    }>;
}
export interface RegressionGateResult {
    passed: boolean;
    checks: Array<{
        metric: string;
        threshold: number;
        actual_value: number;
        passed: boolean;
        message: string;
    }>;
    statistical_significance: {
        p_value: number;
        is_significant: boolean;
    };
    overall_score: number;
    recommendation: {
        should_deploy: boolean;
        reasoning: string;
    };
}
export interface RegressionGateConfig {
    success_rate_threshold: number;
    avg_reward_threshold: number;
    gate_false_positive_rate_threshold: number;
    latency_p95_threshold: number;
    statistical_significance_level: number;
}
