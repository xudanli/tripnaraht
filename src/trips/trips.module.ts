import { Module, forwardRef } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { WorldKernelController } from './world-kernel.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FlightPriceService } from './services/flight-price.service';
import { FlightPriceDetailService } from './services/flight-price-detail.service';
import { ScheduleConverterService } from './services/schedule-converter.service';
import { ActionHistoryService } from './services/action-history.service';
import { TripExtendedService } from './services/trip-extended.service';
import { TripRecapService } from './services/trip-recap.service';
import { TripEmergencyService } from './services/trip-emergency.service';
import { TripBudgetService } from './services/trip-budget.service';
import { TripAdjustmentService } from './services/trip-adjustment.service';
import { TripDraftService } from './services/trip-draft.service';
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

@Module({
  imports: [PrismaModule, LlmModule, forwardRef(() => DecisionModule), ItineraryItemsModule, AuthModule, RedisModule, SharedMemoryModule, ContextEngineModule, forwardRef(() => SkillsModule), forwardRef(() => DecisionDraftModule), forwardRef(() => PlacesModule), DestinationClarificationModule, BookingComModule, DecisionKernelModule, TransportModule, RouteDirectionsModule, DsoFeedbackPersistenceModule, PlanningPolicyModule], // RouteDirectionsModule 用于创建行程时校验路线方向存在性（Should-Exist Gate 前置）
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
    TripMetricsService, 
    TripConflictsService, 
    TripIntentService, 
    TripOptimizationService, 
    TripSuggestionsService, 
    TripInsightService, 
    BudgetEvaluationService,
    EvidenceManagementService,
    EvidenceFetchTaskService,
    NLConversationContextService,
  ], // 导出 Service，供其他模块使用
})
export class TripsModule {}
