// src/railpass/railpass.module.ts

/**
 * RailPass Module
 */

import { Module } from '@nestjs/common';
import { RailPassController } from './railpass.controller';
import { RailPassService } from './railpass.service';
import { EligibilityEngineService } from './services/eligibility-engine.service';
import { PassSelectionEngineService } from './services/pass-selection-engine.service';
import { ReservationDecisionEngineService } from './services/reservation-decision-engine.service';
import { ReservationOrchestrationService } from './services/reservation-orchestration.service';
import { TravelDayCalculationEngineService } from './services/travel-day-calculation-engine.service';
import { ComplianceValidatorService } from './services/compliance-validator.service';
import { RailPassConstraintsService } from './constraints/railpass-constraints.service';
import { ExecutabilityCheckService } from './services/executability-check.service';
import { PlanRegenerationService } from './services/plan-regeneration.service';
import { RailPassActionsService } from './actions/railpass-actions.service';
import { TransportIntegrationService } from './integrations/transport-integration.service';
import { PlanningPolicyIntegrationService } from './integrations/planning-policy-integration.service';
import { ScheduleActionIntegrationService } from './integrations/schedule-action-integration.service';
import { RailPassRuleEngineService } from './rules/railpass-rule-engine.service';
import { PassCoverageCheckerService } from './services/pass-coverage-checker.service';
import { ReservationChannelPolicyService } from './services/reservation-channel-policy.service';

@Module({
  controllers: [RailPassController],
  providers: [
    RailPassService,
    EligibilityEngineService,
    PassSelectionEngineService,
    ReservationDecisionEngineService,
    ReservationOrchestrationService,
    TravelDayCalculationEngineService,
    ComplianceValidatorService,
    RailPassConstraintsService,
    ExecutabilityCheckService,
    PlanRegenerationService,
    RailPassActionsService,
    TransportIntegrationService,
    PlanningPolicyIntegrationService,
    ScheduleActionIntegrationService,
    RailPassRuleEngineService,
    PassCoverageCheckerService,
    ReservationChannelPolicyService,
  ],
  exports: [
    RailPassService,
    RailPassConstraintsService,
    RailPassActionsService,
    TransportIntegrationService,
    PlanningPolicyIntegrationService,
    ScheduleActionIntegrationService,
    EligibilityEngineService,
    PassSelectionEngineService,
    ReservationDecisionEngineService,
    TravelDayCalculationEngineService,
    ComplianceValidatorService,
    ExecutabilityCheckService,
  ],
})
export class RailPassModule {}
