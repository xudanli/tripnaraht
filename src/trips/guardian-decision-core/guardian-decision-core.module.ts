import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SkillsModule } from '../../skills/skills.module';
import { DecisionModule } from '../decision/decision.module';
import { DecisionSemanticsModule } from '../decision-semantics/decision-semantics.module';
import { DataContractsModule } from '../../data-contracts/data-contracts.module';
import { DecisionCoreService } from './services/decision-core.service';
import { EvidenceResolverService } from './evidence/evidence-resolver.service';
import { WorldStateStoreService } from './evidence/world-state-store.service';
import { Rfc001IcelandInternalController } from './api/rfc001-iceland-internal.controller';
import { Rfc001DecisionsController } from './api/rfc001-decisions.controller';
import { Rfc001DecisionCenterReadModelService } from './read-model/rfc001-decision-center-read-model.service';
import { Rfc001DecisionSemanticsProjectorService } from './read-model/rfc001-decision-semantics-projector.service';
import { Rfc001DecisionEngineRoutingService } from './routing/decision-engine-routing.service';
import { LegacyRfc001ComparatorService } from './shadow/legacy-rfc001-comparator.service';
import { RoadSegmentUnavailableShadowService } from './shadow/road-segment-unavailable-shadow.service';
import { RoadCloseImpactAnalyzerService } from './detection/road-close-impact-analyzer.service';
import { DecisionProblemDetectorService } from './detection/decision-problem-detector.service';
import { Rfc001DecisionProblemStoreService } from './persistence/rfc001-decision-problem.store';
import { RoadSegmentUnavailablePipelineService } from './detection/road-segment-unavailable-pipeline.service';
import { DecisionWorkspaceService } from './workspace/decision-workspace.service';
import { RoadSegmentUnavailableEvaluateService } from './orchestration/road-segment-unavailable-evaluate.service';
import { WeatherActivityProhibitedPipelineService } from './detection/weather-activity-prohibited-pipeline.service';
import { WeatherActivityProhibitedEvaluateService } from './orchestration/weather-activity-prohibited-evaluate.service';
import { WeatherActivityProhibitedRunnerService } from './execution/weather-activity-prohibited-runner.service';
import { ExcessiveDailyLoadRunnerService } from './execution/excessive-daily-load-runner.service';
import { ExcessiveDailyLoadPipelineService } from './detection/excessive-daily-load-pipeline.service';
import { ExcessiveDailyLoadEvaluateService } from './orchestration/excessive-daily-load-evaluate.service';
import { Rfc001DecisionFinalizeService } from './execution/rfc001-decision-finalize.service';
import { WeatherLiveEvidenceService } from './evidence/weather-live-evidence.service';
import { RoadSegmentUnavailableRunnerService } from './execution/road-segment-unavailable-runner.service';
import { Rfc001DecisionLedgerStoreService } from './persistence/rfc001-decision-ledger.store';
import { Rfc001PlanVersionStoreService } from './plan-version/plan-version.store';
import { Rfc001PlanVersionService } from './plan-version/plan-version.service';
import { Rfc001AuthorizationService } from './authorization/authorization.service';
import { Rfc001ItineraryMaterializerService } from './execution/rfc001-itinerary-materializer.service';
import { Rfc001PlanVersionApplyExecutor } from './execution/plan-version-apply.executor';
import { Rfc001InternalDeprecationInterceptor } from './api/rfc001-internal-deprecation.interceptor';
import { EffectivePlanExecutionModule } from '../../decision-runtime/execution/effective-plan-execution.module';
import { NeptuneRepairProvider } from '../../decision-runtime/candidates/providers/neptune-repair.provider';

@Module({
  imports: [
    PrismaModule,
    DataContractsModule,
    EffectivePlanExecutionModule,
    forwardRef(() => SkillsModule),
    forwardRef(() => DecisionModule),
    DecisionSemanticsModule,
  ],
  controllers: [Rfc001IcelandInternalController, Rfc001DecisionsController],
  providers: [
    DecisionCoreService,
    EvidenceResolverService,
    WorldStateStoreService,
    RoadCloseImpactAnalyzerService,
    DecisionProblemDetectorService,
    Rfc001DecisionProblemStoreService,
    RoadSegmentUnavailablePipelineService,
    DecisionWorkspaceService,
    RoadSegmentUnavailableEvaluateService,
    NeptuneRepairProvider,
    WeatherActivityProhibitedPipelineService,
    WeatherActivityProhibitedEvaluateService,
    WeatherActivityProhibitedRunnerService,
    ExcessiveDailyLoadPipelineService,
    ExcessiveDailyLoadEvaluateService,
    ExcessiveDailyLoadRunnerService,
    Rfc001DecisionFinalizeService,
    WeatherLiveEvidenceService,
    Rfc001DecisionLedgerStoreService,
    RoadSegmentUnavailableRunnerService,
    Rfc001PlanVersionStoreService,
    Rfc001PlanVersionService,
    Rfc001AuthorizationService,
    Rfc001PlanVersionApplyExecutor,
    Rfc001ItineraryMaterializerService,
    Rfc001DecisionCenterReadModelService,
    Rfc001DecisionSemanticsProjectorService,
    Rfc001DecisionEngineRoutingService,
    LegacyRfc001ComparatorService,
    RoadSegmentUnavailableShadowService,
    Rfc001InternalDeprecationInterceptor,
  ],
  exports: [
    DecisionCoreService,
    EvidenceResolverService,
    WorldStateStoreService,
    RoadCloseImpactAnalyzerService,
    DecisionProblemDetectorService,
    Rfc001DecisionProblemStoreService,
    RoadSegmentUnavailablePipelineService,
    DecisionWorkspaceService,
    RoadSegmentUnavailableEvaluateService,
    WeatherActivityProhibitedPipelineService,
    WeatherActivityProhibitedEvaluateService,
    WeatherActivityProhibitedRunnerService,
    ExcessiveDailyLoadPipelineService,
    ExcessiveDailyLoadEvaluateService,
    ExcessiveDailyLoadRunnerService,
    Rfc001DecisionFinalizeService,
    WeatherLiveEvidenceService,
    Rfc001DecisionLedgerStoreService,
    RoadSegmentUnavailableRunnerService,
    Rfc001PlanVersionStoreService,
    Rfc001PlanVersionService,
    Rfc001AuthorizationService,
    Rfc001PlanVersionApplyExecutor,
    Rfc001ItineraryMaterializerService,
    Rfc001DecisionCenterReadModelService,
    Rfc001DecisionSemanticsProjectorService,
    Rfc001DecisionEngineRoutingService,
    LegacyRfc001ComparatorService,
    RoadSegmentUnavailableShadowService,
  ],
})
export class GuardianDecisionCoreModule {}
