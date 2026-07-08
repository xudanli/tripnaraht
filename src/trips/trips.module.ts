import { Module, forwardRef } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { WorldKernelController } from './world-kernel.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FlightPriceService } from './services/flight-price.service';
import { FlightPriceDetailService } from './services/flight-price-detail.service';
import { ScheduleConverterService } from './services/schedule-converter.service';
import { ScheduleTimelineService } from './services/schedule-timeline.service';
import { TimelineOverviewService } from './services/timeline-overview.service';
import { CollabOverviewService } from './services/collab-overview.service';
import { TripListService } from './services/trip-list.service';
import { CoverImageService } from './services/cover-image.service';
import { AccommodationOverviewService } from './services/accommodation-overview.service';
import { JourneyMapService } from './services/journey-map.service';
import { JourneyMapDecisionItemsService } from './services/journey-map-decision-items.service';
import { ActionHistoryService } from './services/action-history.service';
import { TripExtendedService } from './services/trip-extended.service';
import { TripRecapService } from './services/trip-recap.service';
import { TripEmergencyService } from './services/trip-emergency.service';
import { TripBudgetService } from './services/trip-budget.service';
import { TripAdjustmentService } from './services/trip-adjustment.service';
import { TripDraftService } from './services/trip-draft.service';
import { NlTripCreationOrchestrator } from './services/nl-trip-creation-orchestrator.service';
import { TripPlanningReadinessService } from './services/trip-planning-readiness.service';
import { ClarificationFieldPolicyService } from './services/clarification-field-policy.service';
import { TripPlanningInitializationService } from './services/trip-planning-initialization.service';
import { TripDraftGenerationService } from './services/trip-draft-generation.service';
import { PoiRetrievalService } from './services/poi-retrieval.service';
import { RouteTemplatePlanningService } from './services/route-template-planning.service';
import { CandidateRetrievalEngine } from './services/candidate-retrieval.engine';
import { SpatialClusteringEngine } from './services/spatial-clustering.engine';
import { ConstraintEngine } from './services/constraint.engine';
import { RouteOptimizationEngine } from './services/route-optimization.engine';
import { FatiguePredictionEngine } from './services/fatigue-prediction.engine';
import { PacingEngine } from './services/pacing.engine';
import { BestVisitTimeResolver } from './services/best-visit-time.resolver';
import { TravelSimulationService } from './services/travel-simulation.service';
import { TripMetricsService } from './services/trip-metrics.service';
import { TripConflictsService } from './services/trip-conflicts.service';
import { TripIntentService } from './services/trip-intent.service';
import { TripOptimizationService } from './services/trip-optimization.service';
import { TripSuggestionsService } from './services/trip-suggestions.service';
import { TripInsightService } from './services/trip-insight.service';
import { BudgetEvaluationService } from './services/budget-evaluation.service';
import { EvidenceManagementService } from './services/evidence-management.service';
import { EvidenceFreshnessCalculator } from './services/evidence-freshness-calculator.service';
import { EvidenceConfidenceCalculator } from './services/evidence-confidence-calculator.service';
import { EvidenceQualityScorer } from './services/evidence-quality-scorer.service';
import { EvidenceFilteringService } from './services/evidence-filtering.service';
import { EvidenceCompletenessChecker } from './services/evidence-completeness-checker.service';
import { EvidenceTriggerService } from './services/evidence-trigger.service';
import { EvidenceFetchTaskService } from './services/evidence-fetch-task.service';
import { NLConversationContextService } from './services/nl-conversation-context.service';
import { LlmModule } from '../llm/llm.module';
import { DecisionModule } from './decision/decision.module';
import { SharedMemoryModule } from '../agent/memory/shared-memory.module';
import { ItineraryItemsModule } from '../itinerary-items/itinerary-items.module';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { ContextEngineModule } from '../agent/context-engine/context-engine.module';
import { SkillsModule } from '../skills/skills.module';
import { DecisionDraftModule } from '../decision-draft/decision-draft.module';
import { PlacesModule } from '../places/places.module';
import { DestinationClarificationModule } from './nl-clarification/destination-clarification.module';
import { BookingComModule } from '../mcp/booking-com.module';
import { DecisionKernelModule } from '../decision/decision-kernel.module';
import { TransportModule } from '../transport/transport.module';
import { RouteDirectionsModule } from '../route-directions/route-directions.module';
import { ReadinessModule } from './readiness/readiness.module';
import { DsoFeedbackPersistenceModule } from './decision/dso-feedback-persistence.module';
import { PlanningPolicyModule } from '../planning-policy/planning-policy.module';
import { SolverService } from './solver/solver.service';
import { TripDraftOrchestratorService } from './draft-synthesis/runtime/trip-draft-orchestrator.service';
import { DraftRuntimeCore } from './draft-synthesis/runtime/draft-runtime-core.service';
import { UserIntentStateService } from './services/user-intent-state.service';
import { GlobalPolicyWeightsService } from './services/global-policy-weights.service';
import { WorldSimulationService } from './services/world-simulation.service';
import { WorldOrchestratorService } from './services/world-orchestrator.service';
import { WorldBusService } from './services/world-bus.service';
import { WorldBusEventLogService } from './services/world-bus-event-log.service';
import { WorldKernelService } from './services/world-kernel.service';
import { RealWorldExecutionService } from './services/real-world-execution.service';
import { RealityGovernanceService } from './services/reality-governance.service';
import { CityDigitalTwinService } from './services/city-digital-twin.service';
import { StubRealityApiService } from './services/stub-reality-api.service';
import { EmbeddedHikingTripSummaryService } from './services/embedded-hiking-trip-summary.service';
import { HikingDemoModule } from '../hiking-demo/hiking-demo.module';
import { TripLifecycleValidatorService } from './services/trip-lifecycle-validator.service';
import { TripOutcomeOrchestratorService } from './services/trip-outcome-orchestrator.service';
import { DecisionOSModule } from './decision/optimization/decision-os.module';
import { TravelEventPersistenceService } from './event-store/travel-event-persistence.service';
import { TravelEventSubscriberService } from './event-store/travel-event-subscriber.service';
import { AttributionModule } from './attribution/attribution.module';
import { TravelOutcomeModule } from './outcome/outcome.module';
import { MemoryModule } from './memory/memory.module';
import { NarrativeEngineModule } from './narrative-engine/narrative-engine.module';
import { TripBudgetOsModule } from './budget-os/budget-os.module';
import { TripWishModule } from './wishlist/trip-wish.module';
import { TripSilentVoteModule } from './silent-vote/trip-silent-vote.module';
import { TripDomainInfluenceModule } from './domain-influence/trip-domain-influence.module';
import { TripProcessFairnessModule } from './process-fairness/trip-process-fairness.module';
import { TripDecisionProfilingModule } from './decision-profiling/decision-profiling.module';
import { InTripExecutionModule } from './in-trip-execution/in-trip-execution.module';
import { TripConstraintSolverModule } from './trip-constraint-solver/trip-constraint-solver.module';
import { DecisionSemanticsModule } from './decision-semantics/decision-semantics.module';
import { GuardianDecisionCoreModule } from './guardian-decision-core/guardian-decision-core.module';
import { DecisionGatewayModule } from '../decision-runtime/gateway/decision-gateway.module';
import { LoopsModule } from '../loops/loops.module';
import { IdentityGovernanceModule } from '../identity-governance/identity-governance.module';
import { TripFilesModule } from './trip-files/trip-files.module';
import { ActivityFavoritesModule } from './activity-favorites/activity-favorites.module';
import { PlanObjectsModule } from '../decision-runtime/plan-objects/plan-objects.module';
import { EffectivePlanExecutionModule } from '../decision-runtime/execution/effective-plan-execution.module';
import { TravelStatusModule } from './travel-status/travel-status.module';
import { WorldStateSnapshotModule } from '../decision-runtime/snapshot/world-state-snapshot.module';
import { TripIntentModule } from '../decision-runtime/trigger/trip-intent.module';
import { TripMonitoringModule } from '../decision-runtime/monitoring/trip-monitoring.module';
import { AutomationAuthorizationModule } from '../decision-runtime/authorization/automation-authorization.module';

@Module({
  imports: [PrismaModule, LlmModule, forwardRef(() => DecisionModule), ItineraryItemsModule, AuthModule, RedisModule, SharedMemoryModule, ContextEngineModule, forwardRef(() => SkillsModule), forwardRef(() => DecisionDraftModule), forwardRef(() => PlacesModule), DestinationClarificationModule, BookingComModule, DecisionKernelModule, TransportModule, forwardRef(() => RouteDirectionsModule), ReadinessModule, DsoFeedbackPersistenceModule, PlanningPolicyModule, HikingDemoModule, DecisionOSModule.forFeature({ enableEventSourcing: true }), AttributionModule, TravelOutcomeModule, MemoryModule, NarrativeEngineModule, TripBudgetOsModule, TripWishModule, TripSilentVoteModule, TripDomainInfluenceModule, TripProcessFairnessModule, TripDecisionProfilingModule, InTripExecutionModule, TripConstraintSolverModule, DecisionSemanticsModule, DecisionGatewayModule, GuardianDecisionCoreModule, EffectivePlanExecutionModule, WorldStateSnapshotModule, TravelStatusModule, TripIntentModule, TripMonitoringModule, AutomationAuthorizationModule, LoopsModule, IdentityGovernanceModule, TripFilesModule, ActivityFavoritesModule, PlanObjectsModule], // Gateway 须在 Semantics 之后注册，且 Gateway 开启时 Semantics 仅暴露 L1 路由
  controllers: [TripsController, WorldKernelController],
  providers: [
    TripsService, 
    FlightPriceService, 
    FlightPriceDetailService, 
    ScheduleConverterService, 
    ActionHistoryService, 
    TripExtendedService, 
    TripRecapService, 
    TripEmergencyService, 
    TripBudgetService, 
    TripAdjustmentService, 
    SpatialClusteringEngine,
    ConstraintEngine,
    FatiguePredictionEngine,
    PacingEngine,
    BestVisitTimeResolver,
    TravelSimulationService, // Travel World Model Phase 5: 体验预测
    RouteOptimizationEngine,
    CandidateRetrievalEngine,
    TripDraftService,
    NlTripCreationOrchestrator,
    TripPlanningReadinessService,
    ClarificationFieldPolicyService,
    TripPlanningInitializationService,
    TripDraftGenerationService,
    PoiRetrievalService,
    RouteTemplatePlanningService,
    TripDraftOrchestratorService,
    DraftRuntimeCore,
    UserIntentStateService,
    GlobalPolicyWeightsService,
    WorldSimulationService,
    WorldOrchestratorService,
    WorldBusEventLogService,
    WorldBusService,
    WorldKernelService,
    RealWorldExecutionService,
    RealityGovernanceService,
    CityDigitalTwinService,
    StubRealityApiService,
    TripMetricsService, 
    ScheduleTimelineService,
    TimelineOverviewService,
    CollabOverviewService,
    TripListService,
    CoverImageService,
    AccommodationOverviewService,
    JourneyMapService,
    JourneyMapDecisionItemsService,
    TripConflictsService, 
    TripIntentService, 
    TripOptimizationService, 
    TripSuggestionsService, 
    TripInsightService, 
    BudgetEvaluationService,
    EvidenceManagementService,
    EvidenceFreshnessCalculator,
    EvidenceConfidenceCalculator,
    EvidenceQualityScorer,
    EvidenceFilteringService,
    EvidenceCompletenessChecker,
    EvidenceTriggerService,
    EvidenceFetchTaskService,
    NLConversationContextService,
    SolverService,
    EmbeddedHikingTripSummaryService,
    TripLifecycleValidatorService,
    TripOutcomeOrchestratorService,
    TravelEventPersistenceService,
    TravelEventSubscriberService,
  ],
  exports: [
    WorldKernelService,
    WorldBusService,
    TripsService,
    FlightPriceService,
    FlightPriceDetailService,
    ScheduleConverterService,
    ActionHistoryService,
    TripExtendedService,
    TripRecapService,
    TripEmergencyService,
    TripBudgetService,
    TripAdjustmentService,
    TripDraftService,
    NlTripCreationOrchestrator,
    TripPlanningInitializationService,
    TripDraftGenerationService,
    PoiRetrievalService,
    RouteTemplatePlanningService,
    TripMetricsService,
    ScheduleTimelineService,
    JourneyMapService,
    JourneyMapDecisionItemsService,
    TripConflictsService,
    TripIntentService,
    TripOptimizationService,
    TripSuggestionsService,
    TripInsightService,
    BudgetEvaluationService,
    EvidenceManagementService,
    EvidenceFetchTaskService,
    NLConversationContextService,
    TripOutcomeOrchestratorService,
    NarrativeEngineModule,
    TripBudgetOsModule,
    TripWishModule,
    TripSilentVoteModule,
    TripDomainInfluenceModule,
    TripProcessFairnessModule,
    TripDecisionProfilingModule,
    InTripExecutionModule,
    TripConstraintSolverModule,
    DecisionSemanticsModule,
    GuardianDecisionCoreModule,
  ], // 导出 Service，供其他模块使用
})
export class TripsModule {}
