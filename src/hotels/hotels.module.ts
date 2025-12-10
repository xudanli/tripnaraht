// src/hotels/hotels.module.ts
import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { HotelPriceService } from './services/hotel-price.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HotelsController],
  providers: [HotelPriceService],
  exports: [HotelPriceService],
})
export class HotelsModule {}
