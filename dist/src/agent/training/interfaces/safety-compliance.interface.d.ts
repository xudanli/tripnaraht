import { RiskCategory, RiskEventStatus } from './enums.interface';
export type ConstraintType = 'GEOGRAPHIC' | 'TEMPORAL' | 'COMPLIANCE' | 'USER_PREFERENCE';
export type ConstraintSeverity = 'HARD' | 'SOFT';
export type SEVLevel = 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';
export interface ConstraintRule {
    id: string;
    name: string;
    type: ConstraintType;
    severity: ConstraintSeverity;
    condition: string;
    action: 'BLOCK' | 'WARN' | 'REQUIRE_APPROVAL';
    sev_level: SEVLevel;
    metadata?: Record<string, any>;
}
export interface ConstraintViolation {
    rule_id: string;
    rule_name: string;
    type: ConstraintType;
    severity: ConstraintSeverity;
    sev_level: SEVLevel;
    message: string;
    details: Record<string, any>;
    timestamp: string;
}
export interface ConstraintWarning {
    rule_id: string;
    rule_name: string;
    type: ConstraintType;
    message: string;
    details: Record<string, any>;
    timestamp: string;
}
export interface ConstraintCheckResult {
    violations: ConstraintViolation[];
    warnings: ConstraintWarning[];
    is_blocked: boolean;
    sev_level: SEVLevel;
    requires_approval: boolean;
}
export interface RiskEvent {
    event_id: string;
    request_id: string;
    sev_level: SEVLevel;
    category: RiskCategory;
    description: string;
    violations: ConstraintViolation[];
    status: RiskEventStatus;
    created_at: string;
    resolved_at?: string;
    resolved_by?: string;
    metadata: Record<string, any>;
}
export interface ComplianceAuditRecord {
    audit_id: string;
    request_id: string;
    decision_type: string;
    decision_result: string;
    decision_time: string;
    constraint_check_result: ConstraintCheckResult;
    risk_event?: RiskEvent;
    context: {
        user_input: string;
        planning_request: Record<string, any>;
        model_version: string;
        experiment_id?: string;
    };
    evidence_chain: EvidenceLink[];
    metadata: Record<string, any>;
}
export interface EvidenceLink {
    evidence_id: string;
    evidence_type: 'GATE_RESULT' | 'COMPLIANCE_CHECK' | 'CONSTRAINT_CHECK' | 'USER_APPROVAL' | 'MODEL_DECISION';
    evidence_data: Record<string, any>;
    timestamp: string;
    source: string;
}
export interface ComplianceAuditReport {
    report_id: string;
    period_start: string;
    period_end: string;
    total_decisions: number;
    blocked_decisions: number;
    approved_decisions: number;
    sev_breakdown: {
        sev_1: number;
        sev_2: number;
        sev_3: number;
        sev_4: number;
    };
    constraint_violations: {
        geographic: number;
        temporal: number;
        compliance: number;
        user_preference: number;
    };
    risk_events: RiskEvent[];
    recommendations: string[];
    generated_at: string;
}
export interface SecurityRedTeamTestCase {
    test_id: string;
    name: string;
    category: 'HIGH_RISK_DESTINATION' | 'HIGH_RISK_SEASON' | 'EDGE_CASE' | 'KNOWN_VULNERABILITY';
    description: string;
    input: Record<string, any>;
    expected_result: {
        should_block: boolean;
        sev_level: SEVLevel;
        required_approval: boolean;
    };
    metadata: Record<string, any>;
}
export interface SecurityRedTeamTestResult {
    test_id: string;
    test_case: SecurityRedTeamTestCase;
    actual_result: {
        blocked: boolean;
        sev_level: SEVLevel;
        requires_approval: boolean;
        violations: ConstraintViolation[];
    };
    passed: boolean;
    execution_time_ms: number;
    error?: string;
}
