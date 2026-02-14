"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlacesModule = void 0;
const common_1 = require("@nestjs/common");
const places_controller_1 = require("./places.controller");
const places_service_1 = require("./places.service");
const hotel_recommendation_service_1 = require("./services/hotel-recommendation.service");
const amap_poi_service_1 = require("./services/amap-poi.service");
const google_places_service_1 = require("./services/google-places.service");
const nature_poi_service_1 = require("./services/nature-poi.service");
const nature_poi_mapper_service_1 = require("./services/nature-poi-mapper.service");
const nara_hint_service_1 = require("./services/nara-hint.service");
const route_difficulty_service_1 = require("./services/route-difficulty.service");
const embedding_service_1 = require("./services/embedding.service");
const vector_search_service_1 = require("./services/vector-search.service");
const admin_division_service_1 = require("./services/admin-division.service");
const entity_resolution_service_1 = require("./services/entity-resolution.service");
const svalbard_poi_features_service_1 = require("./services/svalbard-poi-features.service");
const iceland_poi_features_service_1 = require("./services/iceland-poi-features.service");
const place_trail_enrichment_service_1 = require("./services/place-trail-enrichment.service");
const unsplash_service_1 = require("./services/unsplash.service");
const prisma_module_1 = require("../prisma/prisma.module");
const hotels_module_1 = require("../hotels/hotels.module");
const rag_module_1 = require("../rag/rag.module");
const upload_module_1 = require("../upload/upload.module");
const llm_module_1 = require("../llm/llm.module");
let PlacesModule = class PlacesModule {
};
exports.PlacesModule = PlacesModule;
exports.PlacesModule = PlacesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            hotels_module_1.HotelsModule,
            upload_module_1.UploadModule,
            (0, common_1.forwardRef)(() => rag_module_1.RagModule),
            llm_module_1.LlmModule,
        ],
        controllers: [places_controller_1.PlacesController],
        providers: [
            places_service_1.PlacesService,
            hotel_recommendation_service_1.HotelRecommendationService,
            amap_poi_service_1.AmapPOIService,
            google_places_service_1.GooglePlacesService,
            nature_poi_service_1.NaturePoiService,
            nara_hint_service_1.NaraHintService,
            nature_poi_mapper_service_1.NaturePoiMapperService,
            route_difficulty_service_1.RouteDifficultyService,
            embedding_service_1.EmbeddingService,
            vector_search_service_1.VectorSearchService,
            admin_division_service_1.AdminDivisionService,
            entity_resolution_service_1.EntityResolutionService,
            svalbard_poi_features_service_1.SvalbardPoiFeaturesService,
            iceland_poi_features_service_1.IcelandPoiFeaturesService,
            place_trail_enrichment_service_1.PlaceTrailEnrichmentService,
            unsplash_service_1.UnsplashService,
        ],
        exports: [
            places_service_1.PlacesService,
            hotel_recommendation_service_1.HotelRecommendationService,
            amap_poi_service_1.AmapPOIService,
            google_places_service_1.GooglePlacesService,
            nature_poi_service_1.NaturePoiService,
            nature_poi_mapper_service_1.NaturePoiMapperService,
            nara_hint_service_1.NaraHintService,
            embedding_service_1.EmbeddingService,
            vector_search_service_1.VectorSearchService,
            admin_division_service_1.AdminDivisionService,
            entity_resolution_service_1.EntityResolutionService,
            svalbard_poi_features_service_1.SvalbardPoiFeaturesService,
            iceland_poi_features_service_1.IcelandPoiFeaturesService,
            unsplash_service_1.UnsplashService,
        ],
    })
], PlacesModule);
//# sourceMappingURL=places.module.js.map