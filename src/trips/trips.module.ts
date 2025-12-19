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
import { LlmModule } from '../llm/llm.module';
import { DecisionModule } from './decision/decision.module';

@Module({
  imports: [PrismaModule, LlmModule, DecisionModule], // 导入 PrismaModule、LlmModule 和 DecisionModule
  controllers: [TripsController],
  providers: [TripsService, FlightPriceService, FlightPriceDetailService, ScheduleConverterService, ActionHistoryService, TripExtendedService, TripRecapService],
  exports: [TripsService, FlightPriceService, FlightPriceDetailService, ScheduleConverterService, ActionHistoryService, TripExtendedService, TripRecapService], // 导出 Service，供其他模块使用
})
export class TripsModule {}
