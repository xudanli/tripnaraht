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
import { LlmModule } from '../llm/llm.module';
import { DecisionModule } from './decision/decision.module';
import { ItineraryItemsModule } from '../itinerary-items/itinerary-items.module';

@Module({
  imports: [PrismaModule, LlmModule, forwardRef(() => DecisionModule), ItineraryItemsModule], // 必需：TripsService 需要 DecisionLogStorageService
  controllers: [TripsController],
  providers: [TripsService, FlightPriceService, FlightPriceDetailService, ScheduleConverterService, ActionHistoryService, TripExtendedService, TripRecapService, TripEmergencyService, TripBudgetService, TripAdjustmentService, TripDraftService, TripMetricsService, TripConflictsService, TripIntentService, TripOptimizationService, TripSuggestionsService, TripInsightService],
  exports: [TripsService, FlightPriceService, FlightPriceDetailService, ScheduleConverterService, ActionHistoryService, TripExtendedService, TripRecapService, TripEmergencyService, TripBudgetService, TripAdjustmentService, TripDraftService, TripMetricsService, TripConflictsService, TripIntentService, TripOptimizationService, TripSuggestionsService, TripInsightService], // 导出 Service，供其他模块使用
})
export class TripsModule {}
