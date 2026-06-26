import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TripConstraintSolverModule } from '../trips/trip-constraint-solver/trip-constraint-solver.module';
import { InTripExecutionModule } from '../trips/in-trip-execution/in-trip-execution.module';
import { TravelEventStoreModule } from '../trips/event-store/travel-event-store.module';
import { DecisionOSModule } from '../trips/decision/optimization/decision-os.module';
import { TripLoopsController } from './controllers/trip-loops.controller';
import { FeasibilityReportAdapter } from './adapters/feasibility-report.adapter';
import { ExecutionAdvisoryAdapter } from './adapters/execution-advisory.adapter';
import { ReadinessRepairLoop } from './loops/readiness-repair.loop';
import { InTripRecoveryLoop } from './loops/in-trip-recovery.loop';
import { DecisionLearningLoop } from './loops/decision-learning.loop';
import { LoopOrchestratorService } from './services/loop-orchestrator.service';
import { LoopRunRepository } from './services/loop-run.repository';
import { LoopBudgetService } from './services/loop-budget.service';
import { LoopStopPolicyService } from './services/loop-stop-policy.service';
import { HumanApprovalService } from './services/human-approval.service';
import { LoopEventEmitterService } from './services/loop-event-emitter.service';
import { LoopTriggerService } from './services/loop-trigger.service';
import { LoopTriggerBridgeService } from './services/loop-trigger-bridge.service';
import { LoopLearningBridgeService } from './services/loop-learning-bridge.service';
import { InTripRecoveryValidatorService } from './services/in-trip-recovery-validator.service';
import { LoopEvalCaseMaterializerService } from './services/loop-eval-case.materializer.service';
import { LoopEvalCaseStorageService } from './services/loop-eval-case.storage.service';
import { LoopEvalReplayService } from './services/loop-eval-replay.service';
import { LoopEvalApprovalService } from './services/loop-eval-approval.service';
import { LoopEventListenerService } from './services/loop-event-listener.service';
import { DecisionOsP0Module } from '../decision/decision-os-p0.module';
import { ContingencyInTripHandler } from '../decision/contingency/handlers/contingency-in-trip.handler';
import { ContingencyInTripBootstrap } from '../decision/contingency/contingency-in-trip.bootstrap';

@Module({
  imports: [
    PrismaModule,
    DecisionOsP0Module,
    TravelEventStoreModule,
    forwardRef(() => InTripExecutionModule),
    forwardRef(() => TripConstraintSolverModule),
    DecisionOSModule.forFeature({
      enableEventSourcing: true,
      enableAuth: false,
      enableCache: false,
      enableTracing: false,
      enableMetrics: false,
      enableWebSocket: false,
    }),
  ],
  controllers: [TripLoopsController],
  providers: [
    FeasibilityReportAdapter,
    ExecutionAdvisoryAdapter,
    ReadinessRepairLoop,
    InTripRecoveryLoop,
    DecisionLearningLoop,
    LoopOrchestratorService,
    LoopRunRepository,
    LoopBudgetService,
    LoopStopPolicyService,
    HumanApprovalService,
    LoopEventEmitterService,
    LoopTriggerService,
    LoopTriggerBridgeService,
    LoopLearningBridgeService,
    InTripRecoveryValidatorService,
    LoopEvalCaseMaterializerService,
    LoopEvalCaseStorageService,
    LoopEvalReplayService,
    LoopEvalApprovalService,
    LoopEventListenerService,
    ContingencyInTripHandler,
    ContingencyInTripBootstrap,
  ],
  exports: [
    LoopOrchestratorService,
    LoopRunRepository,
    LoopTriggerService,
    LoopTriggerBridgeService,
    LoopLearningBridgeService,
    LoopEventEmitterService,
    LoopEvalCaseStorageService,
    LoopEvalApprovalService,
  ],
})
export class LoopsModule {}
