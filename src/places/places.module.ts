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
import { EmbeddingService } from './services/embedding.service';
import { VectorSearchService } from './services/vector-search.service';
import { AdminDivisionService } from './services/admin-division.service';
import { EntityResolutionService } from './services/entity-resolution.service';
import { SvalbardPoiFeaturesService } from './services/svalbard-poi-features.service';
import { IcelandPoiFeaturesService } from './services/iceland-poi-features.service';
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
    EmbeddingService,
    VectorSearchService,
    AdminDivisionService,
    EntityResolutionService,
    SvalbardPoiFeaturesService,
    IcelandPoiFeaturesService,
  ],
  exports: [
    PlacesService,
    HotelRecommendationService,
    AmapPOIService,
    GooglePlacesService,
    NaturePoiService,
    NaturePoiMapperService,
    NaraHintService,
    EmbeddingService,
    VectorSearchService,
    AdminDivisionService,
    EntityResolutionService,
    SvalbardPoiFeaturesService,
    IcelandPoiFeaturesService,
  ],
})
export class PlacesModule {}

