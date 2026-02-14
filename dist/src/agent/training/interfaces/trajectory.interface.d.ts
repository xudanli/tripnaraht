import { GateResult, Itinerary, DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';
export interface ComplianceResult {
    risk_warnings: Array<{
        level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
        message: string;
        requires_user_confirmation: boolean;
    }>;
    disclaimers: string[];
    required_confirmations: string[];
}
export interface ExecutionResult {
    success: boolean;
    error?: string;
    metadata?: Record<string, any>;
}
export interface TrajectoryValidationResult {
    isValid: boolean;
    score: number;
    reasons: string[];
}
export type RewardSignalType = 'USER_APPROVAL' | 'PLAN_COMMIT' | 'DECISION_ALIGNMENT' | 'EXECUTION_SUCCESS' | 'EXECUTION_FAILURE' | 'GATE_PASS' | 'GATE_FAIL' | 'SAFETY_PASS' | 'COMPLIANCE_PASS' | 'FEASIBILITY_PASS' | 'EVIDENCE_QUALITY' | 'RISK_DISCLOSURE' | 'PREFERENCE_BONUS' | 'CORE_POI_SKIPPED' | 'POI_ADDED';
export interface RewardSignal {
    type: RewardSignalType;
    value: number;
    timestamp: string;
    metadata?: Record<string, any>;
}
export interface TrajectoryCollectionData {
    requestId: string;
    tripId?: string;
    plan: Itinerary;
    decisionTrace: DecisionLogEntry[];
    researchData: Record<string, any>;
    gateResult: GateResult;
    complianceResult: ComplianceResult;
    modelVersion?: string;
    countryCode?: string;
}
export interface TrajectoryUpdateData {
    userApproval?: ApprovalStatus;
    executionResult?: ExecutionResult;
}
export interface WeatherRisk {
    current_conditions: string;
    forecast_window: string;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    blocking_events?: string[];
    temperature_range?: {
        min: number;
        max: number;
    };
    precipitation_probability?: number;
    wind_speed_kmh?: number;
}
export interface RoadConditions {
    f_road_status: Record<string, 'OPEN' | 'CLOSED' | 'RESTRICTED' | 'UNKNOWN'>;
    closure_reasons?: string[];
    seasonal_restrictions?: string[];
    river_crossing_status?: 'SAFE' | 'CAUTION' | 'DANGEROUS' | 'IMPASSABLE';
    last_updated?: string;
}
export interface TerrainFeatures {
    max_elevation_m: number;
    min_elevation_m?: number;
    elevation_gain_m: number;
    river_crossings: number;
    technical_difficulty: 'EASY' | 'MODERATE' | 'DIFFICULT' | 'EXTREME';
    surface_type?: 'PAVED' | 'GRAVEL' | 'DIRT' | 'ROCKY' | 'MIXED';
    gradient_max_percent?: number;
}
export interface TemporalFeatures {
    daylight_hours: number;
    golden_hour_windows?: string[];
    seasonal_context: string;
    aurora_probability?: number;
    midnight_sun?: boolean;
}
export interface SafetyNet {
    nearest_hospital_km: number;
    nearest_gas_station_km?: number;
    cell_coverage_percent: number;
    rescue_response_time_min: number;
    emergency_shelter_available?: boolean;
    satellite_phone_required?: boolean;
}
export interface RiskSummary {
    weather: WeatherRisk;
    road_conditions: RoadConditions;
    terrain: TerrainFeatures;
    temporal: TemporalFeatures;
    safety_net: SafetyNet;
    overall_risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    risk_narrative?: string;
}
export type EvidenceSource = 'KNOWLEDGE_BASE' | 'REAL_TIME_API' | 'USER_INPUT' | 'HISTORICAL_DATA' | 'EXTERNAL_SYSTEM';
export type EvidenceFreshness = 'FRESH' | 'STALE' | 'EXPIRED';
export interface EvidenceRef {
    evidence_id: string;
    source: EvidenceSource;
    source_name: string;
    timestamp: string;
    freshness: EvidenceFreshness;
    freshness_ttl_hours?: number;
    credibility_score: number;
    content_summary: string;
    supports_decision?: string;
    raw_data?: Record<string, any>;
}
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
export interface UncertaintyFlags {
    missing_critical_data: string[];
    stale_data_warnings: string[];
    conflicting_evidence: string[];
    requires_clarification: boolean;
    clarification_points?: string[];
    confidence_level: ConfidenceLevel;
    uncertainty_reasons?: string[];
}
export interface GateContext {
    abu_gate_result: GateResult;
    dre_rhythm_assessment?: {
        pace_score: number;
        rhythm_pattern: string;
        fatigue_risk: 'LOW' | 'MEDIUM' | 'HIGH';
        recommendations?: string[];
    };
    neptune_local_check?: {
        local_accuracy_score: number;
        poi_verification_status: Record<string, 'VERIFIED' | 'UNVERIFIED' | 'CLOSED'>;
        local_insights?: string[];
    };
    gate_evidence_refs: string[];
    gate_decision_time?: string;
}
export interface RLState {
    request_id: string;
    trip_id?: string;
    user_request: string;
    origin?: string | {
        lat: number;
        lng: number;
    };
    destination?: string | {
        lat: number;
        lng: number;
    };
    date_range?: {
        start_date: string;
        end_date: string;
    };
    constraints?: Record<string, any>;
    preferences?: Record<string, any>;
    research_data?: Record<string, any>;
    gate_result?: GateResult;
    compliance_result?: ComplianceResult;
    current_itinerary?: Itinerary;
    decision_history?: DecisionLogEntry[];
    metadata?: {
        country_code?: string;
        model_version?: string;
        timestamp?: string;
    };
}
export interface TripNARARLState extends RLState {
    risk_summary: RiskSummary;
    evidence: EvidenceRef[];
    uncertainty_flags: UncertaintyFlags;
    gate_context: GateContext;
}
export interface RLAction {
    action_type: 'PLAN_GENERATE' | 'ROUTE_ADJUST' | 'PACE_ADJUST' | 'BUDGET_ADJUST' | 'TRANSPORT_SELECT' | 'POI_SELECT' | 'GATE_CHECK' | 'COMPLIANCE_CHECK' | 'USER_CLARIFICATION';
    action_params: Record<string, any>;
    reasoning?: string;
    decision_point?: string;
    actor?: string;
    alternatives_considered?: Array<{
        option: any;
        score?: number;
        reason?: string;
    }>;
    metadata?: Record<string, any>;
}
export interface RLReward {
    total_reward: number;
    reward_signals: RewardSignal[];
    validation_score?: number;
    user_approval?: ApprovalStatus;
    execution_success?: boolean;
    metadata?: Record<string, any>;
}
export interface RLTrajectoryStep {
    step_index: number;
    state: RLState;
    action: RLAction;
    reward: RLReward;
    next_state?: RLState;
    timestamp: string;
}
export interface RLTrajectory {
    trajectory_id: string;
    request_id: string;
    trip_id?: string;
    steps: RLTrajectoryStep[];
    metadata: {
        model_version: string;
        country_code?: string;
        created_at: string;
        updated_at: string;
        validation_status: 'VALIDATED' | 'REJECTED' | 'PENDING';
        validation_score?: number;
        total_reward: number;
    };
}
export interface TrajectoryETLOptions {
    trajectory_ids?: string[];
    request_ids?: string[];
    min_validation_score?: number;
    min_total_reward?: number;
    model_version?: string;
    country_code?: string;
    date_range?: {
        start: string;
        end: string;
    };
    limit?: number;
    offset?: number;
}
export type ETLExportFormat = 'jsonl' | 'parquet' | 'json';
export interface ETLExportResult {
    format: ETLExportFormat;
    file_path: string;
    record_count: number;
    file_size_bytes: number;
    metadata: {
        exported_at: string;
        trajectory_ids: string[];
        stats: {
            total_steps: number;
            avg_reward: number;
            avg_validation_score: number;
        };
    };
}
