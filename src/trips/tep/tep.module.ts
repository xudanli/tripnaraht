import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { GuardianDecisionCoreModule } from '../guardian-decision-core/guardian-decision-core.module';
import { DecisionGatewayModule } from '../../decision-runtime/gateway/decision-gateway.module';
import { EffectivePlanExecutionModule } from '../../decision-runtime/execution/effective-plan-execution.module';
import { ExecutabilityController } from './controllers/executability.controller';
import { ExecutabilityAssessmentService } from './services/executability-assessment.service';
import { WorldStateTepEvidenceService } from './services/world-state-tep-evidence.service';
import { TepOrchestratorService } from './orchestrators/tep-orchestrator.service';
import { TepPlanMetadataService } from './services/tep-plan-metadata.service';
import { TepRuntimeTriggerService } from './services/tep-runtime-trigger.service';
import { TepRuntimePipelineBridgeService } from './services/tep-runtime-pipeline.bridge';
import { TepExecutionSlipDaylightBridgeService } from './services/tep-execution-slip-daylight.bridge';
import { TepErcBridgeService } from './services/tep-erc-bridge.service';
import { TepLocalRepairApplyService } from './services/tep-local-repair-apply.service';
import { TepRepairExecutionStore } from './services/tep-repair-execution.store';

@Module({
  imports: [
    PrismaModule,
    TripConstraintSolverModule,
    forwardRef(() => GuardianDecisionCoreModule),
    forwardRef(() => DecisionGatewayModule),
    EffectivePlanExecutionModule,
  ],
  controllers: [ExecutabilityController],
  providers: [
    ExecutabilityAssessmentService,
    WorldStateTepEvidenceService,
    TepOrchestratorService,
    TepPlanMetadataService,
    TepRuntimeTriggerService,
    TepRuntimePipelineBridgeService,
    TepExecutionSlipDaylightBridgeService,
    TepErcBridgeService,
    TepLocalRepairApplyService,
    TepRepairExecutionStore,
  ],
  exports: [
    ExecutabilityAssessmentService,
    TepOrchestratorService,
    WorldStateTepEvidenceService,
    TepPlanMetadataService,
    TepRuntimeTriggerService,
    TepRuntimePipelineBridgeService,
    TepExecutionSlipDaylightBridgeService,
    TepErcBridgeService,
    TepLocalRepairApplyService,
    TepRepairExecutionStore,
  ],
})
export class TepModule {}
