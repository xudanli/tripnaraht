// src/places/places.module.ts
import { Module } from '@nestjs/common';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { HotelRecommendationService } from './services/hotel-recommendation.service';
import { AmapPOIService } from './services/amap-poi.service';
import { GooglePlacesService } from './services/google-places.service';
import { NaturePoiService } from './services/nature-poi.service';
import { NaturePoiMapperService } from './services/nature-poi-mapper.service';
import { NaraHintService } from './services/nara-hint.service';
import { RouteDifficultyService } from './services/route-difficulty.service';
import { PrismaModule } from '../prisma/prisma.module';
import { HotelsModule } from '../hotels/hotels.module';

@Module({
  imports: [PrismaModule, HotelsModule],
  controllers: [PlacesController],
  providers: [
    PlacesService,
    HotelRecommendationService,
    AmapPOIService,
    GooglePlacesService,
    NaturePoiService,
    NaraHintService, // NaraHintService 需要在 NaturePoiMapperService 之前
    NaturePoiMapperService,
    RouteDifficultyService,
  ],
  exports: [
    PlacesService,
    HotelRecommendationService,
    AmapPOIService,
    GooglePlacesService,
    NaturePoiService,
    NaturePoiMapperService,
    NaraHintService,
  ],
})
export class PlacesModule {}

