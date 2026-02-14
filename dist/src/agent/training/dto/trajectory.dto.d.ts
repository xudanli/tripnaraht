import { Itinerary, DecisionLogEntry, GateResult } from '../../interfaces/trip-plan.interface';
import { ComplianceResult } from '../interfaces/trajectory.interface';
export declare class CollectTrajectoryDto {
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
export declare class ValidateTrajectoryDto {
    gateResult?: GateResult;
    complianceResult?: ComplianceResult;
    userApproval?: 'APPROVED' | 'REJECTED' | 'PENDING';
    executionResult?: {
        success: boolean;
        error?: string;
    };
}
export declare class CollectTrajectoryResponseDto {
    trajectoryId: string;
    status: string;
    validationScore?: number;
}
export declare class ValidateTrajectoryResponseDto {
    isValid: boolean;
    score: number;
    reasons: string[];
    validationStatus: 'VALIDATED' | 'REJECTED';
}
