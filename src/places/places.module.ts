// src/places/places.module.ts
import { Module } from '@nestjs/common';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { HotelRecommendationService } from './services/hotel-recommendation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlacesController],
  providers: [PlacesService, HotelRecommendationService],
  exports: [PlacesService, HotelRecommendationService],
})
export class PlacesModule {}

