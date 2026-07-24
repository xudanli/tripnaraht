import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LlmModule } from '../../llm/llm.module';
import { RagModule } from '../../rag/rag.module';
import { DecisionGatewayModule } from '../../decision-runtime/gateway/decision-gateway.module';
import { WorldStateSnapshotModule } from '../../decision-runtime/snapshot/world-state-snapshot.module';
import { UnifiedConstraintAssessmentModule } from '../../decision-runtime/constraints/unified-constraint-assessment.module';
import { GuardianDecisionCoreModule } from '../guardian-decision-core/guardian-decision-core.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { ArrangeItineraryModule } from '../arrange-itinerary/arrange-itinerary.module';
import { ExecutionRiskCenterModule } from '../execution-risk-center/execution-risk-center.module';
import { PageInsightController } from './page-insight.controller';
import { PageAIContractRegistry } from './services/page-ai-contract.registry';
import { PageInsightContextHashService } from './services/page-insight-context-hash.service';
import { PageInsightCacheService } from './services/page-insight-cache.service';
import { PageInsightFeedbackStore } from './services/page-insight-feedback.store';
import { DecisionSpacePageContextBuilder } from './services/decision-space-page-context.builder';
import { ActivityEditorPageContextBuilder } from './services/activity-editor-page-context.builder';
import { ItineraryDayEditorPageContextBuilder } from './services/itinerary-day-editor-page-context.builder';
import { PlanningOverviewPageContextBuilder } from './services/planning-overview-page-context.builder';
import { ExecutionHomePageContextBuilder } from './services/execution-home-page-context.builder';
import { InsuranceDecisionContextAssembler } from './services/insurance-decision-context.assembler';
import { InsuranceClauseKnowledgeService } from './services/insurance-clause-knowledge.service';
import { VehicleDecisionContextAssembler } from './services/vehicle-decision-context.assembler';
import { PageInsightNarrativeService } from './services/page-insight-narrative.service';
import { PageInsightOrchestratorService } from './services/page-insight-orchestrator.service';

@Module({
  imports: [
    PrismaModule,
    TripConstraintSolverModule,
    forwardRef(() => LlmModule),
    forwardRef(() => RagModule),
    forwardRef(() => DecisionGatewayModule),
    forwardRef(() => WorldStateSnapshotModule),
    forwardRef(() => UnifiedConstraintAssessmentModule),
    forwardRef(() => GuardianDecisionCoreModule),
    forwardRef(() => ArrangeItineraryModule),
    forwardRef(() => ExecutionRiskCenterModule),
  ],
  controllers: [PageInsightController],
  providers: [
    PageAIContractRegistry,
    PageInsightContextHashService,
    PageInsightCacheService,
    PageInsightFeedbackStore,
    DecisionSpacePageContextBuilder,
    ActivityEditorPageContextBuilder,
    ItineraryDayEditorPageContextBuilder,
    PlanningOverviewPageContextBuilder,
    ExecutionHomePageContextBuilder,
    InsuranceDecisionContextAssembler,
    InsuranceClauseKnowledgeService,
    VehicleDecisionContextAssembler,
    PageInsightNarrativeService,
    PageInsightOrchestratorService,
  ],
  exports: [
    PageInsightOrchestratorService,
    PageAIContractRegistry,
    PageInsightContextHashService,
    PageInsightFeedbackStore,
  ],
})
export class CopilotModule {}
