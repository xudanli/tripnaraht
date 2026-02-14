import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';
import { EligibilityEngineService } from './eligibility-engine.service';
import { TravelDayCalculationEngineService } from './travel-day-calculation-engine.service';
import { ReservationOrchestrationService } from './reservation-orchestration.service';
interface ValidateComplianceInput {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    reservationTasks?: ReservationTask[];
}
interface ComplianceViolation {
    code: string;
    severity: 'error' | 'warning';
    message: string;
    segmentId?: string;
    details?: any;
}
interface ComplianceValidationResult {
    valid: boolean;
    violations: ComplianceViolation[];
    warnings: ComplianceViolation[];
}
export declare class ComplianceValidatorService {
    private readonly eligibilityEngine;
    private readonly travelDayCalculator;
    private readonly reservationOrchestrator;
    private readonly logger;
    constructor(eligibilityEngine: EligibilityEngineService, travelDayCalculator: TravelDayCalculationEngineService, reservationOrchestrator: ReservationOrchestrationService);
    validateCompliance(input: ValidateComplianceInput): ComplianceValidationResult;
    generateUserExplanation(result: ComplianceValidationResult): string;
}
export {};
