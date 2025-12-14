import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FlightPriceService } from './services/flight-price.service';
import { FlightPriceDetailService } from './services/flight-price-detail.service';
import { ScheduleConverterService } from './services/schedule-converter.service';
import { ActionHistoryService } from './services/action-history.service';

@Module({
  imports: [PrismaModule], // 导入 PrismaModule 以使用 PrismaService
  controllers: [TripsController],
  providers: [TripsService, FlightPriceService, FlightPriceDetailService, ScheduleConverterService, ActionHistoryService],
  exports: [TripsService, FlightPriceService, FlightPriceDetailService, ScheduleConverterService, ActionHistoryService], // 导出 Service，供其他模块使用
})
export class TripsModule {}
