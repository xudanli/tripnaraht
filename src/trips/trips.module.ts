import { Module, forwardRef } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
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
import { ItineraryItemsModule } from '../itinerary-items/itinerary-items.module';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { ContextEngineModule } from '../agent/context-engine/context-engine.module';
import { SkillsModule } from '../skills/skills.module';
import { DecisionDraftModule } from '../decision-draft/decision-draft.module';
import { PlacesModule } from '../places/places.module';
import { DestinationClarificationModule } from './nl-clarification/destination-clarification.module';
import { BookingComModule } from '../mcp/booking-com.module';

@Module({
  imports: [PrismaModule, LlmModule, forwardRef(() => DecisionModule), ItineraryItemsModule, AuthModule, RedisModule, ContextEngineModule, forwardRef(() => SkillsModule), forwardRef(() => DecisionDraftModule), forwardRef(() => PlacesModule), DestinationClarificationModule, BookingComModule], // 必需：TripsService 需要 DecisionLogStorageService, TripsController 需要 JwtService, NLConversationContextService 需要 RedisService, ContextEngineerService 用于构建 Context Package, DecisionDraftModule 用于生成决策草案, PlacesModule 用于酒店推荐（使用 forwardRef 避免循环依赖：TripsModule -> DecisionDraftModule -> ChainOfWorkModule -> AgentModule -> TripsModule，以及 TripsModule -> PlacesModule -> RagModule -> SkillsModule -> TripsModule），DestinationClarificationModule 用于目的地特化澄清，BookingComModule 用于租车成本估算和需求检查
  controllers: [TripsController],
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
    TripDraftService, 
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
  ],
  exports: [
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
