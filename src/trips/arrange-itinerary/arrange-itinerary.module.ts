import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ItineraryItemsModule } from '../../itinerary-items/itinerary-items.module';
import { EffectivePlanExecutionModule } from '../../decision-runtime/execution/effective-plan-execution.module';
import { DecisionGatewayModule } from '../../decision-runtime/gateway/decision-gateway.module';
import { SolverModule } from '../../decision-runtime/solver/solver.module';
import { TripsModule } from '../trips.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { CausalRuntimeModule } from '../causal-runtime/causal-runtime.module';
import { CausalProtocolModule } from '../../causal-protocol/causal-protocol.module';
import { TripSilentVoteModule } from '../silent-vote/trip-silent-vote.module';
import { AttractionExploreModule } from '../attraction-explore/attraction-explore.module';
import {
  ArrangeItineraryController,
  AttractionExploreArrangeController,
} from './arrange-itinerary.controller';
import { DecisionSpaceBundleController } from './decision-space-bundle.controller';
import { ArrangeItineraryItemsService } from './services/arrange-itinerary-items.service';
import { ArrangeItineraryOverviewService } from './services/arrange-itinerary-overview.service';
import { ArrangeItineraryAiActionsService } from './services/arrange-itinerary-ai-actions.service';
import { PlanProposalStoreService } from './services/plan-proposal-store.service';
import { PlanProposalContextService } from './services/plan-proposal-context.service';
import { PlanProposalValidationService } from './services/plan-proposal-validation.service';
import { PlanProposalBuilderService } from './services/plan-proposal-builder.service';
import { PlanProposalApplyService } from './services/plan-proposal-apply.service';
import { PlanningOrchestratorFacadeService } from './services/planning-orchestrator-facade.service';
import { PlanningItemLockService } from './services/planning-item-lock.service';
import { PlanningModeService } from './services/planning-mode.service';
import { ArrangeItineraryMoveAnalysisService } from './services/arrange-itinerary-move-analysis.service';
import { ArrangeItineraryMapPlacementService } from './services/arrange-itinerary-map-placement.service';
import { ArrangeItineraryCopilotService } from './services/arrange-itinerary-copilot.service';
import { PlanningCopilotActionService } from './services/planning-copilot-action.service';
import { PlanningWorkbenchSnapshotService } from './services/planning-workbench-snapshot.service';
import { PlanningProposalMonitorService } from './services/planning-proposal-monitor.service';
import { PlanningDecisionPackService } from './services/planning-decision-pack.service';
import { PlanningDecisionCausalChainService } from './services/planning-decision-causal-chain.service';
import { PlanningDecisionBasisService } from './services/planning-decision-basis.service';
import { PlanningDecisionInspectorService } from './services/planning-decision-inspector.service';
import { DecisionSpaceBundleService } from './services/decision-space-bundle.service';

@Module({
  imports: [
    PrismaModule,
    ItineraryItemsModule,
    EffectivePlanExecutionModule,
    DecisionGatewayModule,
    SolverModule,
    forwardRef(() => TripsModule),
    forwardRef(() => AttractionExploreModule),
    TripConstraintSolverModule,
    ReadinessModule,
    CausalRuntimeModule,
    CausalProtocolModule,
    TripSilentVoteModule,
  ],
  controllers: [
    ArrangeItineraryController,
    AttractionExploreArrangeController,
    DecisionSpaceBundleController,
  ],
  providers: [
    ArrangeItineraryItemsService,
    ArrangeItineraryOverviewService,
    ArrangeItineraryAiActionsService,
    PlanProposalStoreService,
    PlanProposalContextService,
    PlanProposalValidationService,
    PlanProposalBuilderService,
    PlanProposalApplyService,
    PlanningOrchestratorFacadeService,
    PlanningItemLockService,
    PlanningModeService,
    ArrangeItineraryMoveAnalysisService,
    ArrangeItineraryMapPlacementService,
    ArrangeItineraryCopilotService,
    PlanningCopilotActionService,
    PlanningWorkbenchSnapshotService,
    PlanningProposalMonitorService,
    PlanningDecisionPackService,
    PlanningDecisionCausalChainService,
    PlanningDecisionBasisService,
    PlanningDecisionInspectorService,
    DecisionSpaceBundleService,
  ],
  exports: [PlanningOrchestratorFacadeService, PlanningModeService],
})
export class ArrangeItineraryModule {}
