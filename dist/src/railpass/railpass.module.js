"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailPassModule = void 0;
const common_1 = require("@nestjs/common");
const railpass_controller_1 = require("./railpass.controller");
const railpass_service_1 = require("./railpass.service");
const eligibility_engine_service_1 = require("./services/eligibility-engine.service");
const pass_selection_engine_service_1 = require("./services/pass-selection-engine.service");
const reservation_decision_engine_service_1 = require("./services/reservation-decision-engine.service");
const reservation_orchestration_service_1 = require("./services/reservation-orchestration.service");
const travel_day_calculation_engine_service_1 = require("./services/travel-day-calculation-engine.service");
const compliance_validator_service_1 = require("./services/compliance-validator.service");
const railpass_constraints_service_1 = require("./constraints/railpass-constraints.service");
const executability_check_service_1 = require("./services/executability-check.service");
const plan_regeneration_service_1 = require("./services/plan-regeneration.service");
const railpass_actions_service_1 = require("./actions/railpass-actions.service");
const transport_integration_service_1 = require("./integrations/transport-integration.service");
const planning_policy_integration_service_1 = require("./integrations/planning-policy-integration.service");
const schedule_action_integration_service_1 = require("./integrations/schedule-action-integration.service");
const railpass_rule_engine_service_1 = require("./rules/railpass-rule-engine.service");
const pass_coverage_checker_service_1 = require("./services/pass-coverage-checker.service");
const reservation_channel_policy_service_1 = require("./services/reservation-channel-policy.service");
let RailPassModule = class RailPassModule {
};
exports.RailPassModule = RailPassModule;
exports.RailPassModule = RailPassModule = __decorate([
    (0, common_1.Module)({
        controllers: [railpass_controller_1.RailPassController],
        providers: [
            railpass_service_1.RailPassService,
            eligibility_engine_service_1.EligibilityEngineService,
            pass_selection_engine_service_1.PassSelectionEngineService,
            reservation_decision_engine_service_1.ReservationDecisionEngineService,
            reservation_orchestration_service_1.ReservationOrchestrationService,
            travel_day_calculation_engine_service_1.TravelDayCalculationEngineService,
            compliance_validator_service_1.ComplianceValidatorService,
            railpass_constraints_service_1.RailPassConstraintsService,
            executability_check_service_1.ExecutabilityCheckService,
            plan_regeneration_service_1.PlanRegenerationService,
            railpass_actions_service_1.RailPassActionsService,
            transport_integration_service_1.TransportIntegrationService,
            planning_policy_integration_service_1.PlanningPolicyIntegrationService,
            schedule_action_integration_service_1.ScheduleActionIntegrationService,
            railpass_rule_engine_service_1.RailPassRuleEngineService,
            pass_coverage_checker_service_1.PassCoverageCheckerService,
            reservation_channel_policy_service_1.ReservationChannelPolicyService,
        ],
        exports: [
            railpass_service_1.RailPassService,
            railpass_constraints_service_1.RailPassConstraintsService,
            railpass_actions_service_1.RailPassActionsService,
            transport_integration_service_1.TransportIntegrationService,
            planning_policy_integration_service_1.PlanningPolicyIntegrationService,
            schedule_action_integration_service_1.ScheduleActionIntegrationService,
            eligibility_engine_service_1.EligibilityEngineService,
            pass_selection_engine_service_1.PassSelectionEngineService,
            reservation_decision_engine_service_1.ReservationDecisionEngineService,
            travel_day_calculation_engine_service_1.TravelDayCalculationEngineService,
            compliance_validator_service_1.ComplianceValidatorService,
            executability_check_service_1.ExecutabilityCheckService,
        ],
    })
], RailPassModule);
//# sourceMappingURL=railpass.module.js.map