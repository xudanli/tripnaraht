// src/flight-prices/flight-prices.module.ts
import { Module } from '@nestjs/common';
import { FlightPricesController } from './flight-prices.controller';
import { FlightPriceService } from '../trips/services/flight-price.service';
import { FlightPriceDetailService } from '../trips/services/flight-price-detail.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FlightPricesController],
  providers: [FlightPriceService, FlightPriceDetailService],
  exports: [FlightPriceService, FlightPriceDetailService],
})
export class FlightPricesModule {}

