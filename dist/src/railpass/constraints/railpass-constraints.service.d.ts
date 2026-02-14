import { CheckerViolation } from '../../trips/decision/constraints/constraint-checker';
import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';
import { ComplianceValidatorService } from '../services/compliance-validator.service';
import { PassCoverageCheckerService } from '../services/pass-coverage-checker.service';
export declare class RailPassConstraintsService {
    private readonly complianceValidator;
    private readonly coverageChecker;
    private readonly logger;
    constructor(complianceValidator: ComplianceValidatorService, coverageChecker: PassCoverageCheckerService);
    checkReservationMandatory(segments: RailSegment[], reservationTasks: ReservationTask[]): CheckerViolation[];
    checkHomeCountryRule(passProfile: RailPassProfile): CheckerViolation[];
    checkTravelDayBudget(passProfile: RailPassProfile, segments: RailSegment[], travelDayResult: {
        totalDaysUsed: number;
        remainingDays?: number;
    }): CheckerViolation[];
    checkReservationBudget(reservationTasks: ReservationTask[], maxBudget?: number): CheckerViolation[];
    checkPassCoverage(segment: RailSegment, passProfile: RailPassProfile): CheckerViolation[];
    checkLastDayNightTrain(segment: RailSegment, passProfile: RailPassProfile): CheckerViolation[];
    checkAllConstraints(args: {
        passProfile: RailPassProfile;
        segments: RailSegment[];
        reservationTasks: ReservationTask[];
        travelDayResult?: {
            totalDaysUsed: number;
            remainingDays?: number;
        };
        maxReservationBudget?: number;
    }): CheckerViolation[];
}
