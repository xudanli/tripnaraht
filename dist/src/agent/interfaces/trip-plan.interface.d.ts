import { ClarificationQuestion } from './clarification.interface';
export interface TripPlanRequest {
    request_id: string;
    origin: string | {
        lat: number;
        lng: number;
    };
    destination: string | {
        lat: number;
        lng: number;
    };
    date_range?: {
        start_date: string;
        end_date: string;
    };
    start_date?: string;
    days?: number;
    mode?: 'walk' | 'drive' | 'transit' | 'mixed';
    party?: {
        count: number;
        has_children?: boolean;
        has_elderly?: boolean;
        fitness_level?: 'low' | 'medium' | 'high';
    };
    constraints?: {
        budget?: {
            total?: number;
            currency?: string;
        };
        daily_time_window?: {
            start: string;
            end: string;
        };
        max_ascent_m?: number;
        max_walk_km?: number;
        wheelchair_accessible?: boolean;
        no_stairs?: boolean;
        max_transfers?: number;
        restroom_interval_minutes?: number;
    };
    preferences?: {
        scenic_priority?: boolean;
        efficiency_priority?: boolean;
        avoid_tolls?: boolean;
        avoid_highways?: boolean;
    };
}
export type GateResultStatus = 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
export interface GateViolation {
    type: 'REACHABILITY' | 'SAFETY' | 'DEM' | 'DATA_MISSING' | 'TIME_CONFLICT' | 'FATIGUE' | 'BUDGET';
    severity: 'HARD' | 'SOFT';
    detail: string;
    evidence_refs?: string[];
}
export interface RequiredAdjustment {
    action: 'CHANGE_MODE' | 'CHANGE_DATES' | 'SHORTEN_DAY' | 'REPLACE_SEGMENT' | 'REPLACE_POI' | 'ADD_BUFFER' | 'CHANGE_TRANSPORT';
    why: string;
    target?: string;
    alternatives?: string[];
}
export interface GateResult {
    gate_result: GateResultStatus;
    violations: GateViolation[];
    required_adjustments: RequiredAdjustment[];
    confidence: number;
    evidence_refs?: string[];
    guardian_results?: {
        abu?: {
            verdict: 'ALLOW' | 'REJECT';
            evidence: string[];
        };
        drdre?: {
            verdict: 'ALLOW' | 'ADJUST' | 'REJECT';
            evidence: string[];
        };
        neptune?: {
            verdict: 'ALLOW' | 'REPLACE' | 'REJECT';
            evidence: string[];
        };
    };
}
export interface EvidenceRef {
    evidence_id: string;
    source: string;
    source_title?: string;
    source_url?: string;
    publisher?: string;
    published_at?: string;
    retrieved_at?: string;
    last_verified_at: string;
    data_timestamp?: string;
    excerpt?: string;
    relevance?: number;
    confidence: number;
    related_decision_ids?: string[];
    url?: string;
    data?: Record<string, any>;
}
export type ItineraryItemType = 'TRANSIT' | 'DRIVE' | 'WALK' | 'POI' | 'REST' | 'MEAL' | 'ACCOMMODATION';
export interface ItineraryItem {
    id: string;
    type: ItineraryItemType;
    start_window: string;
    end_window: string;
    location_ref: {
        place_id?: string;
        name: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
        address?: string;
    };
    notes?: string;
    evidence_refs: string[];
    verified: boolean;
    verification_status?: 'VERIFIED' | 'UNVERIFIED' | 'NEED_TOOL' | 'ASSUMPTION';
    metadata?: {
        duration_minutes?: number;
        cost?: number;
        opening_hours?: string;
        accessibility?: string;
        risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
        distance_meters?: number;
        transport_mode_changed?: boolean;
    };
}
export interface ItineraryDay {
    date: string;
    items: ItineraryItem[];
}
export interface Itinerary {
    request_id: string;
    days: ItineraryDay[];
    metadata?: {
        total_days: number;
        total_cost_estimate?: number;
        robustness_score?: number;
    };
}
export type OrchestrationStep = 'INTAKE' | 'RESEARCH' | 'GATE_EVAL' | 'PLAN_GEN' | 'VERIFY' | 'COMPLIANCE' | 'REPAIR' | 'NARRATE' | 'FEEDBACK' | 'DONE' | 'FAILED' | 'TIMEOUT' | 'HALLUCINATION_DETECTION';
export type GuardianType = 'ABU' | 'DR_DRE' | 'NEPTUNE';
export type SubAgentType = 'Orchestrator' | 'Planner' | 'Gatekeeper' | 'Compliance' | 'LocalInsight' | 'CoreDecision' | 'Narrator' | 'HallucinationDetection';
export interface DecisionLogEntry {
    request_id: string;
    step: OrchestrationStep;
    actor: SubAgentType;
    inputs_summary: string;
    outputs_summary: string;
    evidence_refs: string[];
    timestamp: string;
    metadata?: {
        duration_ms?: number;
        tool_calls?: number;
        cost_est_usd?: number;
        alternatives_considered?: number;
        guardian?: GuardianType;
        [key: string]: any;
    };
}
export interface SimplifiedExplanation {
    summary: string;
    key_decisions: Array<{
        step: string;
        decision: string;
        impact: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    evidence_count: number;
    has_details: boolean;
    details_url?: string;
}
export interface AICapabilityDisplay {
    success: boolean;
    capabilities_used: Array<{
        name: string;
        description: string;
        status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
    }>;
    data_quality: {
        completeness: number;
        freshness: number;
        reliability: number;
    };
    confidence: {
        overall: number;
        gate_evaluation: number;
        plan_generation: number;
    };
    limitations?: Array<{
        type: 'DATA_MISSING' | 'SERVICE_UNAVAILABLE' | 'UNCERTAINTY' | 'ASSUMPTION';
        description: string;
        impact: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
}
export interface PlanDiff {
    version_from: number;
    version_to: number;
    changes: Array<{
        type: 'ADD' | 'UPDATE' | 'DELETE';
        field: string;
        path: string;
        old_value?: any;
        new_value?: any;
        reason?: string;
    }>;
    timestamp: string;
}
export interface OrchestratorState {
    request_id: string;
    plan_id?: string;
    plan_version?: number;
    plan_diff?: PlanDiff;
    current_step: OrchestrationStep;
    trip_plan_request?: TripPlanRequest;
    gaps?: Array<{
        type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
        severity: 'HARD' | 'SOFT';
        detail: string;
    }>;
    clarification_questions?: ClarificationQuestion[];
    research_data?: Record<string, any>;
    gate_result?: GateResult;
    compliance_result?: {
        risk_warnings: Array<{
            level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
            category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
            message: string;
            requires_user_confirmation: boolean;
        }>;
        disclaimers: string[];
        required_confirmations: string[];
    };
    itinerary?: Itinerary;
    alternatives?: {
        alternative_pois: Array<{
            poi_id: string;
            name: string;
            reason: string;
            evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
            evidence_refs?: string[];
        }>;
        alternative_routes: Array<{
            route_id: string;
            description: string;
            reason: string;
            evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
            evidence_refs?: string[];
        }>;
    };
    narration?: {
        user_friendly_summary: string;
        day_by_day_narrative: Array<{
            day: number;
            date: string;
            narrative: string;
        }>;
        highlights: string[];
        tips: string[];
        warnings?: string[];
    };
    evidence_registry: Map<string, EvidenceRef>;
    decision_log: DecisionLogEntry[];
    decision_steps?: any[];
    errors: Array<{
        step: OrchestrationStep;
        error_code: string;
        message: string;
        timestamp: string;
    }>;
    metadata: {
        started_at: string;
        last_updated_at: string;
        total_duration_ms?: number;
        warnings?: Array<{
            type: string;
            message: string;
            items?: any[];
        }>;
        [key: string]: any;
    };
}
