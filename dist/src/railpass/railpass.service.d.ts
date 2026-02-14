import { EligibilityResult, PassRecommendation, ReservationPlanResult, TravelDayCalculationResult, ComplianceValidationResult, RailPassProfile, RailSegment, ReservationTask } from './interfaces/railpass.interface';
import { EligibilityEngineService } from './services/eligibility-engine.service';
import { PassSelectionEngineService } from './services/pass-selection-engine.service';
import { ReservationDecisionEngineService } from './services/reservation-decision-engine.service';
import { ReservationOrchestrationService } from './services/reservation-orchestration.service';
import { TravelDayCalculationEngineService } from './services/travel-day-calculation-engine.service';
import { ComplianceValidatorService } from './services/compliance-validator.service';
import { ExecutabilityCheckService } from './services/executability-check.service';
import { PlanRegenerationService, RegeneratePlanResult } from './services/plan-regeneration.service';
import { RailPassRuleEngineService } from './rules/railpass-rule-engine.service';
import { PassCoverageCheckerService } from './services/pass-coverage-checker.service';
import { ReservationChannelPolicyService } from './services/reservation-channel-policy.service';
import { CoverageCheckResult } from './services/pass-coverage-checker.service';
import { RuleEvaluationResult } from './rules/railpass-rule-engine.service';
import { ExecutabilityCheckOverview, HighRiskAlert } from './interfaces/executability-check.interface';
import { PassProfileWizardDto } from './dto/pass-profile-wizard.dto';
import { CheckExecutabilityDto, RegeneratePlanDto } from './dto/executability-check.dto';
export declare class RailPassService {
    private readonly eligibilityEngine;
    private readonly passSelectionEngine;
    private readonly reservationDecisionEngine;
    private readonly reservationOrchestrator;
    private readonly travelDayCalculator;
    private readonly complianceValidator;
    private readonly executabilityCheckService;
    private readonly planRegenerationService;
    private readonly ruleEngine;
    private readonly coverageChecker;
    private readonly channelPolicyService;
    private readonly logger;
    constructor(eligibilityEngine: EligibilityEngineService, passSelectionEngine: PassSelectionEngineService, reservationDecisionEngine: ReservationDecisionEngineService, reservationOrchestrator: ReservationOrchestrationService, travelDayCalculator: TravelDayCalculationEngineService, complianceValidator: ComplianceValidatorService, executabilityCheckService: ExecutabilityCheckService, planRegenerationService: PlanRegenerationService, ruleEngine: RailPassRuleEngineService, coverageChecker: PassCoverageCheckerService, channelPolicyService: ReservationChannelPolicyService);
    checkEligibility(args: {
        residencyCountry: string;
        travelCountries: string[];
        isCrossResidencyCountry?: boolean;
        departureDate: string;
    }): Promise<EligibilityResult>;
    recommendPass(args: {
        residencyCountry: string;
        travelCountries: string[];
        estimatedRailSegments: number;
        crossCountryCount: number;
        isDailyTravel: boolean;
        stayMode: 'city_hopping' | 'stay_extended';
        budgetSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
        tripDurationDays: number;
        tripDateRange: {
            start: string;
            end: string;
        };
        passFamily: 'EURAIL' | 'INTERRAIL';
        preferences?: {
            preferFlexibility?: boolean;
            preferMobile?: boolean;
            preferFirstClass?: boolean;
        };
        sampleSegments?: RailSegment[];
    }): Promise<PassRecommendation>;
    checkReservation(segment: RailSegment): Promise<import("./interfaces/railpass.interface").ReservationRequirement>;
    planReservations(args: {
        segments: RailSegment[];
        userPreferences?: {
            maxReservationFee?: number;
            preferNoReservation?: boolean;
        };
    }): Promise<ReservationPlanResult>;
    simulateTravelDays(args: {
        segments: RailSegment[];
        passProfile: RailPassProfile;
    }): Promise<TravelDayCalculationResult>;
    validateCompliance(args: {
        passProfile: RailPassProfile;
        segments: RailSegment[];
        reservationTasks?: any[];
    }): Promise<ComplianceValidationResult>;
    generateUserExplanation(result: ComplianceValidationResult): string;
    checkExecutability(dto: CheckExecutabilityDto): Promise<ExecutabilityCheckOverview>;
    generateHighRiskAlerts(dto: CheckExecutabilityDto): Promise<HighRiskAlert[]>;
    completePassProfile(dto: PassProfileWizardDto): Promise<{
        passProfile: RailPassProfile;
        eligibility: EligibilityResult;
        missingInfo: string[];
    }>;
    regeneratePlan(dto: RegeneratePlanDto): Promise<{
        segments: RailSegment[];
        reservationTasks: ReservationTask[];
        changes: Array<{
            segmentId: string;
            changeType: string;
            reason: string;
        }>;
        metrics: any;
        explanation: string;
    }>;
    regeneratePlanWithData(args: {
        passProfile: RailPassProfile;
        segments: RailSegment[];
        reservationTasks: ReservationTask[];
        strategy: 'MORE_STABLE' | 'MORE_ECONOMICAL' | 'MORE_AFFORDABLE' | 'CUSTOM';
        customParams?: {
            avoidMandatoryReservations?: boolean;
            minimizeTravelDays?: boolean;
            maxReservationFee?: number;
        };
    }): Promise<RegeneratePlanResult>;
    private getMissingInfo;
    checkCoverage(segment: RailSegment, passProfile: RailPassProfile): Promise<CoverageCheckResult>;
    getReservationChannels(segments: RailSegment[]): Promise<{
        segmentId: string;
        from: string;
        to: string;
        policy: import("./services/reservation-channel-policy.service").ReservationChannelPolicy;
        urgency: "LOW" | "MEDIUM" | "HIGH";
        bookingDeadline?: string;
    }[]>;
    evaluateRules(args: {
        segments: RailSegment[];
        passProfile: RailPassProfile;
        reservationTasks?: ReservationTask[];
        travelDayResult?: {
            totalDaysUsed: number;
            daysByDate: Record<string, any>;
        };
    }): Promise<RuleEvaluationResult>;
}
