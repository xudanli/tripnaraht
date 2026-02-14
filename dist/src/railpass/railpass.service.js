"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RailPassService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailPassService = void 0;
const common_1 = require("@nestjs/common");
const eligibility_engine_service_1 = require("./services/eligibility-engine.service");
const pass_selection_engine_service_1 = require("./services/pass-selection-engine.service");
const reservation_decision_engine_service_1 = require("./services/reservation-decision-engine.service");
const reservation_orchestration_service_1 = require("./services/reservation-orchestration.service");
const travel_day_calculation_engine_service_1 = require("./services/travel-day-calculation-engine.service");
const compliance_validator_service_1 = require("./services/compliance-validator.service");
const executability_check_service_1 = require("./services/executability-check.service");
const plan_regeneration_service_1 = require("./services/plan-regeneration.service");
const railpass_rule_engine_service_1 = require("./rules/railpass-rule-engine.service");
const pass_coverage_checker_service_1 = require("./services/pass-coverage-checker.service");
const reservation_channel_policy_service_1 = require("./services/reservation-channel-policy.service");
let RailPassService = RailPassService_1 = class RailPassService {
    constructor(eligibilityEngine, passSelectionEngine, reservationDecisionEngine, reservationOrchestrator, travelDayCalculator, complianceValidator, executabilityCheckService, planRegenerationService, ruleEngine, coverageChecker, channelPolicyService) {
        this.eligibilityEngine = eligibilityEngine;
        this.passSelectionEngine = passSelectionEngine;
        this.reservationDecisionEngine = reservationDecisionEngine;
        this.reservationOrchestrator = reservationOrchestrator;
        this.travelDayCalculator = travelDayCalculator;
        this.complianceValidator = complianceValidator;
        this.executabilityCheckService = executabilityCheckService;
        this.planRegenerationService = planRegenerationService;
        this.ruleEngine = ruleEngine;
        this.coverageChecker = coverageChecker;
        this.channelPolicyService = channelPolicyService;
        this.logger = new common_1.Logger(RailPassService_1.name);
    }
    async checkEligibility(args) {
        return this.eligibilityEngine.checkEligibility(args);
    }
    async recommendPass(args) {
        return this.passSelectionEngine.recommendPass(args, args.sampleSegments);
    }
    async checkReservation(segment) {
        return this.reservationDecisionEngine.checkReservation(segment);
    }
    async planReservations(args) {
        return this.reservationOrchestrator.planReservations(args);
    }
    async simulateTravelDays(args) {
        return this.travelDayCalculator.simulateTravelDays(args);
    }
    async validateCompliance(args) {
        return this.complianceValidator.validateCompliance(args);
    }
    generateUserExplanation(result) {
        return this.complianceValidator.generateUserExplanation(result);
    }
    async checkExecutability(dto) {
        const placeNamesMap = dto.placeNames
            ? new Map(Object.entries(dto.placeNames).map(([k, v]) => [Number(k), v]))
            : undefined;
        return this.executabilityCheckService.checkExecutability({
            passProfile: dto.passProfile,
            segments: dto.segments,
            reservationTasks: dto.reservationTasks,
            placeNames: placeNamesMap,
        });
    }
    async generateHighRiskAlerts(dto) {
        return this.executabilityCheckService.generateHighRiskAlerts({
            passProfile: dto.passProfile,
            segments: dto.segments,
            reservationTasks: dto.reservationTasks,
        });
    }
    async completePassProfile(dto) {
        const eligibility = await this.eligibilityEngine.checkEligibility({
            residencyCountry: dto.residencyCountry,
            travelCountries: dto.passType === 'ONE_COUNTRY' && dto.oneCountryCode
                ? [dto.oneCountryCode]
                : [],
            departureDate: dto.validityStartDate || new Date().toISOString().split('T')[0],
        });
        const passProfile = {
            residencyCountry: dto.residencyCountry,
            passFamily: eligibility.recommendedPassFamily,
            passType: dto.passType,
            validityType: dto.validityType,
            travelDaysTotal: dto.validityType === 'FLEXI' ? dto.travelDaysTotal : undefined,
            homeCountryOutboundUsed: 0,
            homeCountryInboundUsed: 0,
            class: dto.class || 'SECOND',
            mobileOrPaper: dto.mobileOrPaper || undefined,
            validityStartDate: dto.validityStartDate || new Date().toISOString().split('T')[0],
            validityEndDate: dto.validityEndDate || new Date().toISOString().split('T')[0],
        };
        return {
            passProfile,
            eligibility,
            missingInfo: this.getMissingInfo(passProfile),
        };
    }
    async regeneratePlan(dto) {
        throw new Error('regeneratePlan 需要 passProfile、segments、reservationTasks 参数。请使用 regeneratePlanWithData 方法');
    }
    async regeneratePlanWithData(args) {
        return this.planRegenerationService.regeneratePlan(args);
    }
    getMissingInfo(profile) {
        const missing = [];
        if (!profile.mobileOrPaper) {
            missing.push('载体类型（mobile/paper）');
        }
        if (profile.validityType === 'FLEXI' && !profile.travelDaysTotal) {
            missing.push('Travel Days 总数');
        }
        return missing;
    }
    async checkCoverage(segment, passProfile) {
        return this.coverageChecker.checkCoverage(segment, passProfile);
    }
    async getReservationChannels(segments) {
        return this.channelPolicyService.generateBookingChecklist(segments);
    }
    async evaluateRules(args) {
        return this.ruleEngine.evaluateRules(args);
    }
};
exports.RailPassService = RailPassService;
exports.RailPassService = RailPassService = RailPassService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [eligibility_engine_service_1.EligibilityEngineService,
        pass_selection_engine_service_1.PassSelectionEngineService,
        reservation_decision_engine_service_1.ReservationDecisionEngineService,
        reservation_orchestration_service_1.ReservationOrchestrationService,
        travel_day_calculation_engine_service_1.TravelDayCalculationEngineService,
        compliance_validator_service_1.ComplianceValidatorService,
        executability_check_service_1.ExecutabilityCheckService,
        plan_regeneration_service_1.PlanRegenerationService,
        railpass_rule_engine_service_1.RailPassRuleEngineService,
        pass_coverage_checker_service_1.PassCoverageCheckerService,
        reservation_channel_policy_service_1.ReservationChannelPolicyService])
], RailPassService);
//# sourceMappingURL=railpass.service.js.map