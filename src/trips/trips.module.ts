import { Module } from '@nestjs/common';
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
import { LlmModule } from '../llm/llm.module';
import { DecisionModule } from './decision/decision.module';
import { ItineraryItemsModule } from '../itinerary-items/itinerary-items.module';

@Module({
  imports: [PrismaModule, LlmModule, DecisionModule, ItineraryItemsModule], // 导入 PrismaModule、LlmModule、DecisionModule 和 ItineraryItemsModule
  controllers: [TripsController],
  providers: [TripsService, FlightPriceService, FlightPriceDetailService, ScheduleConverterService, ActionHistoryService, TripExtendedService, TripRecapService, TripEmergencyService, TripBudgetService, TripAdjustmentService, TripDraftService],
  exports: [TripsService, FlightPriceService, FlightPriceDetailService, ScheduleConverterService, ActionHistoryService, TripExtendedService, TripRecapService, TripEmergencyService, TripBudgetService, TripAdjustmentService, TripDraftService], // 导出 Service，供其他模块使用
})
export class TripsModule {}
