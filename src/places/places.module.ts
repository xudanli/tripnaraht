// src/places/places.module.ts
import { Module } from '@nestjs/common';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { HotelRecommendationService } from './services/hotel-recommendation.service';
import { AmapPOIService } from './services/amap-poi.service';
import { PrismaModule } from '../prisma/prisma.module';
import { HotelsModule } from '../hotels/hotels.module';

@Module({
  imports: [PrismaModule, HotelsModule],
  controllers: [PlacesController],
  providers: [PlacesService, HotelRecommendationService, AmapPOIService],
  exports: [PlacesService, HotelRecommendationService, AmapPOIService],
})
export class PlacesModule {}

