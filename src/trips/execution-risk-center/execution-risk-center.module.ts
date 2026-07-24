import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InTripExecutionModule } from '../in-trip-execution/in-trip-execution.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { DecisionGatewayModule } from '../../decision-runtime/gateway/decision-gateway.module';
import { TravelStatusModule } from '../travel-status/travel-status.module';
import { TripsModule } from '../trips.module';
import { GuardianDecisionCoreModule } from '../guardian-decision-core/guardian-decision-core.module';
import { TepModule } from '../tep/tep.module';
import { EffectivePlanExecutionModule } from '../../decision-runtime/execution/effective-plan-execution.module';
import { ExecutionRisksController } from './controllers/execution-risks.controller';
import { ActiveRiskAggregationService } from './services/active-risk-aggregation.service';
import { ExecutionRiskSummaryService } from './services/execution-risk-summary.service';
import { ExecutionRiskUserStateService } from './services/execution-risk-user-state.service';
import { ExecutionRiskRecommendationService } from './services/execution-risk-recommendation.service';
import { ExecutionRiskApplyService } from './services/execution-risk-apply.service';
import { ExecutionRiskConfirmWriteService } from './services/execution-risk-confirm-write.service';
import { ExecutionAdjustmentQueueProjectionService } from './services/execution-adjustment-queue-projection.service';
import { ExecutionAdjustmentQueueContextService } from './services/execution-adjustment-queue-context.service';
import { ExecutionRiskKnowledgeRepositoryService } from './knowledge/execution-risk-knowledge.repository';
import { SeverityRuleEvaluatorService } from './knowledge/severity-rule-evaluator.service';
import { ActiveRiskKnowledgeEnrichmentService } from './knowledge/active-risk-knowledge-enrichment.service';
import { SeverityHysteresisService } from './knowledge/severity-hysteresis.service';
import { SeverityHysteresisStoreService } from './knowledge/severity-hysteresis.store';
import { Rfc001ExecutionRiskWriteAdapter } from './adapters/rfc001-execution-risk-write.adapter';
import { ExecutionRiskPlanVersionActivateService } from './services/execution-risk-plan-version-activate.service';
import { ActiveRiskRefreshService } from './services/active-risk-refresh.service';
import { ActiveRiskQueryService } from './services/active-risk-query.service';
import { ExecutionRiskConfirmTransactionService } from './services/execution-risk-confirm-transaction.service';
import { ExecutionRiskCanonicalApplyAdapter } from './adapters/execution-risk-canonical-apply.adapter';

import { ExecutionRiskShadowCompareService } from './services/execution-risk-shadow-compare.service';
import { ExecutionRiskShadowMetricsService } from './services/execution-risk-shadow-metrics.service';
import { ExecutionUserNarrativeNarratorService } from './services/execution-user-narrative-narrator.service';

@Module({
  imports: [
    PrismaModule,
    InTripExecutionModule,
    TripConstraintSolverModule,
    DecisionGatewayModule,
    TravelStatusModule,
    GuardianDecisionCoreModule,
    forwardRef(() => TepModule),
    EffectivePlanExecutionModule,
    forwardRef(() => TripsModule),
  ],
  controllers: [ExecutionRisksController],
  providers: [
    ActiveRiskAggregationService,
    ExecutionRiskSummaryService,
    ExecutionRiskUserStateService,
    ExecutionRiskRecommendationService,
    ExecutionRiskApplyService,
    ExecutionRiskConfirmWriteService,
    Rfc001ExecutionRiskWriteAdapter,
    ExecutionAdjustmentQueueProjectionService,
    ExecutionAdjustmentQueueContextService,
    ExecutionRiskKnowledgeRepositoryService,
    SeverityRuleEvaluatorService,
    SeverityHysteresisService,
    SeverityHysteresisStoreService,
    ActiveRiskKnowledgeEnrichmentService,
    ExecutionRiskPlanVersionActivateService,
    ActiveRiskRefreshService,
    ActiveRiskQueryService,
    ExecutionRiskConfirmTransactionService,
    ExecutionRiskCanonicalApplyAdapter,
    ExecutionRiskShadowCompareService,
    ExecutionRiskShadowMetricsService,
    ExecutionUserNarrativeNarratorService,
  ],
  exports: [
    ActiveRiskAggregationService,
    ExecutionRiskSummaryService,
    ExecutionAdjustmentQueueProjectionService,
    ExecutionRiskKnowledgeRepositoryService,
    SeverityRuleEvaluatorService,
    SeverityHysteresisService,
    ActiveRiskKnowledgeEnrichmentService,
    ExecutionRiskCanonicalApplyAdapter,
    ActiveRiskRefreshService,
    ActiveRiskQueryService,
    ExecutionRiskShadowCompareService,
    ExecutionRiskShadowMetricsService,
    ExecutionUserNarrativeNarratorService,
  ],
})
export class ExecutionRiskCenterModule {}
