// src/places/places.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { PlacesController } from './places.controller';
// PlacesV5Controller 已删除 - 使用 PlacesController 替代
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
import { PlaceTrailEnrichmentService } from './services/place-trail-enrichment.service';
import { UnsplashService } from './services/unsplash.service';
import { ExperienceVectorService } from './services/experience-vector.service';
import { PlaceGraphService } from './services/place-graph.service';
import { DistrictService } from './services/district.service';
import { CrowdCurveService } from './services/crowd-curve.service';
import { PrismaModule } from '../prisma/prisma.module';
import { HotelsModule } from '../hotels/hotels.module';
import { RagModule } from '../rag/rag.module';
import { UploadModule } from '../upload/upload.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    PrismaModule, 
    HotelsModule,
    UploadModule, // 导入上传模块以使用 UploadService
    forwardRef(() => RagModule), // 导入RAG模块以使用EmbeddingCacheService（使用forwardRef避免循环依赖）
    LlmModule, // 导入LLM模块以使用 PythonAIService
  ],
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
    PlaceTrailEnrichmentService,
    UnsplashService, // 图片服务
    ExperienceVectorService, // Travel World Model: 体验向量
    PlaceGraphService, // Travel World Model: Place Graph
    DistrictService, // Travel World Model: District 区域模型
    CrowdCurveService, // Travel World Model Phase 6: 人流曲线
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
    UnsplashService, // 图片服务
    ExperienceVectorService,
    PlaceGraphService,
    DistrictService,
    CrowdCurveService,
  ],
})
export class PlacesModule {}

