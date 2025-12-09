import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FlightPriceService } from './services/flight-price.service';
import { FlightPriceDetailService } from './services/flight-price-detail.service';

@Module({
  imports: [PrismaModule], // 导入 PrismaModule 以使用 PrismaService
  controllers: [TripsController],
  providers: [TripsService, FlightPriceService, FlightPriceDetailService],
  exports: [TripsService, FlightPriceService, FlightPriceDetailService], // 导出 Service，供其他模块使用
})
export class TripsModule {}
