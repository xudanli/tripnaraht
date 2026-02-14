import { GateResult } from '../../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';
import { ComplianceResult, ExecutionResult, TrajectoryValidationResult, RLTrajectory } from '../interfaces/trajectory.interface';
export declare enum TripNARARejectCode {
    EVIDENCE_MISSING = "EVIDENCE_MISSING",
    EVIDENCE_STALE = "EVIDENCE_STALE",
    EVIDENCE_CONFLICT = "EVIDENCE_CONFLICT",
    EVIDENCE_INSUFFICIENT = "EVIDENCE_INSUFFICIENT",
    GATE_BYPASSED = "GATE_BYPASSED",
    GATE_RESULT_MISSING = "GATE_RESULT_MISSING",
    GATE_NOT_REPRODUCIBLE = "GATE_NOT_REPRODUCIBLE",
    GATE_BLOCKED = "GATE_BLOCKED",
    NON_EXECUTABLE_PLAN = "NON_EXECUTABLE_PLAN",
    TEMPORAL_CONFLICT = "TEMPORAL_CONFLICT",
    SPATIAL_INCONSISTENCY = "SPATIAL_INCONSISTENCY",
    HIGH_RISK_NOT_DISCLOSED = "HIGH_RISK_NOT_DISCLOSED",
    NO_ALTERNATIVE_FOR_BLOCKED = "NO_ALTERNATIVE_FOR_BLOCKED",
    SAFETY_OVERRIDE_UNJUSTIFIED = "SAFETY_OVERRIDE_UNJUSTIFIED",
    CRITICAL_RISK_WARNING = "CRITICAL_RISK_WARNING",
    DECISION_CHAIN_BROKEN = "DECISION_CHAIN_BROKEN",
    STATE_ACTION_MISMATCH = "STATE_ACTION_MISMATCH",
    MISSING_ACTOR_ATTRIBUTION = "MISSING_ACTOR_ATTRIBUTION",
    EXECUTION_FAILED = "EXECUTION_FAILED",
    USER_REJECTED = "USER_REJECTED"
}
export type RejectSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';
export interface RejectReason {
    code: TripNARARejectCode;
    message: string;
    severity: RejectSeverity;
    step_index?: number;
}
export interface AuditabilityResult {
    gate_reproducible: boolean;
    decision_chain_complete: boolean;
    evidence_coverage: number;
    state_action_consistency: boolean;
    actor_attribution_complete: boolean;
}
export interface TripNARAValidationResult {
    isValid: boolean;
    score: number;
    trainable: boolean;
    trainable_for_dpo: boolean;
    trainable_for_ppo: boolean;
    rejection_reasons: RejectReason[];
    auditability: AuditabilityResult;
    metadata: {
        validation_time: string;
        validator_version: string;
    };
}
export declare class TrajectoryValidatorService {
    private readonly logger;
    private readonly VALIDATOR_VERSION;
    validateTripNARATrajectory(trajectory: RLTrajectory): Promise<TripNARAValidationResult>;
    private checkEvidence;
    private checkGateIntegrity;
    private checkRiskDisclosure;
    private checkDecisionChain;
    private checkActorAttribution;
    private isStateTransitionValid;
    private calculateAuditability;
    private calculateEvidenceCoverage;
    validateTrajectory(gateResult: GateResult, complianceResult: ComplianceResult, userApproval?: ApprovalStatus, executionResult?: ExecutionResult): Promise<TrajectoryValidationResult>;
}
