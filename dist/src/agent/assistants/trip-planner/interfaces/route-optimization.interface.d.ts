export type HardGateRule = 'REACHABILITY' | 'SAFETY' | 'DATA_MISSING' | 'TIME_CONFLICT' | 'GEO_IMPOSSIBLE' | 'OPENING_HOURS' | 'TRANSFER_BUFFER';
export type SoftScoreDimension = 'FATIGUE' | 'PACE' | 'EXPERIENCE' | 'EFFICIENCY';
export interface HardGateResult {
    rule: HardGateRule;
    result: 'PASS' | 'FAIL';
    severity: 'ERROR' | 'WARNING';
    detail: string;
    suggestion?: string;
    evidence_ref?: string;
    day?: number;
    item_id?: string;
    affected_items?: string[];
}
export interface SoftScoreResult {
    dimension: SoftScoreDimension;
    score: number;
    threshold: number;
    exceeded: boolean;
    weight: number;
    detail?: string;
    suggestion?: string;
}
export type AlternativeStrategy = 'REMOVE_POI' | 'CHANGE_DAY' | 'ADD_BUFFER' | 'CHANGE_TRANSPORT' | 'ADJUST_TIME' | 'REPLACE_POI';
export interface RouteAlternative {
    id: string;
    strategy: AlternativeStrategy;
    priority: number;
    description: string;
    impact: {
        time_change_minutes?: number;
        cost_change?: number;
        removed_items?: string[];
        added_items?: string[];
    };
    confidence: number;
    evidence_ref?: string;
}
export interface DataTimestamp {
    data_source: string;
    retrieved_at: string;
    data_timestamp?: string;
    expiration_policy: {
        type: 'FIXED_DURATION' | 'EVENT_BASED';
        duration_hours?: number;
        event?: string;
    };
    is_expired: boolean;
}
export interface NextStepAction {
    action: 'APPLY' | 'ADJUST' | 'REJECT' | 'CONFIRM' | 'AUTO_FIX';
    route_id?: string;
    alternative_id?: string;
    message: string;
    requires_user_confirmation: boolean;
}
export interface RouteOptimizationEvidence {
    evidence_id: string;
    generated_at: string;
    trip_id: string;
    conclusion: {
        route_approved: boolean;
        rejection_reasons?: string[];
        adjustment_required: boolean;
        executability_score: number;
        confidence: number;
    };
    hard_gates: HardGateResult[];
    soft_scores: {
        fatigue: SoftScoreResult;
        pace: SoftScoreResult;
        experience: SoftScoreResult;
        efficiency: SoftScoreResult;
        overall: number;
    };
    key_features: {
        total_days: number;
        total_activities: number;
        cities_involved: string[];
        max_daily_distance_km?: number;
        max_daily_activity_minutes?: number;
        cross_city_segments?: Array<{
            day: number;
            from_city: string;
            to_city: string;
            distance_km: number;
            estimated_travel_minutes: number;
        }>;
        night_segments?: Array<{
            day: number;
            start: string;
            end: string;
            risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
            description?: string;
        }>;
        no_rescue_segments?: Array<{
            day: number;
            start: string;
            end: string;
            distance_km: number;
            risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
            description?: string;
        }>;
        time_conflicts: number;
        missing_data: string[];
    };
    alternatives: RouteAlternative[];
    candidate_routes?: {
        routes: Array<{
            id: string;
            strategy: 'COMPACT' | 'BALANCED' | 'RELAXED';
            score: number;
            description: string;
            key_features: {
                total_duration_minutes: number;
                total_distance_km: number;
                activity_count: number;
                fatigue_score: number;
                pace_score: number;
            };
        }>;
        best_route_id?: string;
        statistics: {
            total_generated: number;
            successful: number;
            failed: number;
        };
    };
    data_timestamps: DataTimestamp[];
    next_steps: NextStepAction[];
    raw_verification?: {
        verified: boolean;
        issues: Array<{
            type: string;
            severity: string;
            message: string;
            suggestion?: string;
        }>;
        summary: {
            total_issues: number;
            error_count: number;
            warning_count: number;
        };
    };
}
export interface RouteOptimizationRequest {
    trip_id: string;
    user_id?: string;
    optimization_goal?: 'BALANCE' | 'COMPACT' | 'RELAXED' | 'EFFICIENT';
    weights?: {
        comfort?: number;
        efficiency?: number;
        safety?: number;
        scenic?: number;
    };
    constraints?: {
        max_daily_activities?: number;
        max_daily_hours?: number;
        must_include_pois?: string[];
        must_exclude_pois?: string[];
        preferred_transport?: string[];
    };
    generate_alternatives?: boolean;
    max_alternatives?: number;
    generate_candidate_routes?: boolean;
    candidate_route_config?: {
        strategies?: Array<'COMPACT' | 'BALANCED' | 'RELAXED'>;
        samples_per_strategy?: number;
        use_multiple_starts?: boolean;
    };
}
export interface RouteOptimizationMetrics {
    request_id: string;
    executable: boolean;
    rejection_reasonable?: boolean;
    alternative_accepted?: boolean;
    hard_gate_hits: number;
    soft_score_average: number;
    alternatives_generated: number;
    processing_time_ms: number;
    data_completeness: number;
}
export interface MissingDataStrategy {
    critical_data_missing: {
        strategy: 'REJECT';
        message: string;
        required_fields: string[];
    };
    partial_data_missing: {
        strategy: 'WARN_AND_CONTINUE' | 'GENERATE_ALTERNATIVES';
        message: string;
        missing_fields: string[];
        use_assumption: boolean;
        assumption_source?: string;
    };
}
