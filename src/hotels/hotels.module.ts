// src/hotels/hotels.module.ts
import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { HotelPriceService } from './services/hotel-price.service';
import { HotelPricePredictionService } from './services/hotel-price-prediction.service';
import { FlightPricesModule } from '../flight-prices/flight-prices.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, FlightPricesModule], // 导入 FlightPricesModule 以使用 ProphetService
  controllers: [HotelsController],
  providers: [HotelPriceService, HotelPricePredictionService],
  exports: [HotelPriceService],
})
export class HotelsModule {}
