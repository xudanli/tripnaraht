import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';
import { ExecutabilityCheckOverview, HighRiskAlert } from '../interfaces/executability-check.interface';
import { ReservationDecisionEngineService } from './reservation-decision-engine.service';
import { TravelDayCalculationEngineService } from './travel-day-calculation-engine.service';
import { ComplianceValidatorService } from './compliance-validator.service';
import { RailPassConstraintsService } from '../constraints/railpass-constraints.service';
interface CheckExecutabilityInput {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    reservationTasks?: ReservationTask[];
    placeNames?: Map<number, {
        name: string;
        countryCode: string;
    }>;
}
export declare class ExecutabilityCheckService {
    private readonly reservationEngine;
    private readonly travelDayCalculator;
    private readonly complianceValidator;
    private readonly constraintsService;
    private readonly logger;
    constructor(reservationEngine: ReservationDecisionEngineService, travelDayCalculator: TravelDayCalculationEngineService, complianceValidator: ComplianceValidatorService, constraintsService: RailPassConstraintsService);
    checkExecutability(input: CheckExecutabilityInput): Promise<ExecutabilityCheckOverview>;
    private generateSegmentCard;
    private determineCoverage;
    private determineRiskLevel;
    private generateKeySuggestions;
    private generateDetails;
    private generateReservationSuggestions;
    private checkMissingInfo;
    private generateSummarySuggestions;
    generateHighRiskAlerts(input: CheckExecutabilityInput): Promise<HighRiskAlert[]>;
    private createAlertFromViolation;
}
export {};
