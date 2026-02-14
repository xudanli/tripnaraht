"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../prisma/prisma.module");
const readiness_service_1 = require("./services/readiness.service");
const readiness_checker_1 = require("./engine/readiness-checker");
const facts_to_readiness_compiler_1 = require("./compilers/facts-to-readiness.compiler");
const readiness_to_constraints_compiler_1 = require("./compilers/readiness-to-constraints.compiler");
const pack_storage_service_1 = require("./storage/pack-storage.service");
const pack_validator_service_1 = require("./storage/pack-validator.service");
const geo_facts_river_service_1 = require("./services/geo-facts-river.service");
const geo_facts_mountain_service_1 = require("./services/geo-facts-mountain.service");
const geo_facts_road_service_1 = require("./services/geo-facts-road.service");
const geo_facts_coastline_service_1 = require("./services/geo-facts-coastline.service");
const geo_facts_port_service_1 = require("./services/geo-facts-port.service");
const geo_facts_airline_service_1 = require("./services/geo-facts-airline.service");
const geo_facts_poi_service_1 = require("./services/geo-facts-poi.service");
const poi_pickup_scorer_service_1 = require("./services/poi-pickup-scorer.service");
const poi_trailhead_service_1 = require("./services/poi-trailhead.service");
const geo_facts_service_1 = require("./services/geo-facts.service");
const geo_facts_cache_service_1 = require("./services/geo-facts-cache.service");
const physical_reality_retrieval_service_1 = require("./services/physical-reality-retrieval.service");
const physical_reality_quality_monitor_service_1 = require("./services/physical-reality-quality-monitor.service");
const physical_reality_dem_association_service_1 = require("./services/physical-reality-dem-association.service");
const capability_pack_evaluator_service_1 = require("./services/capability-pack-evaluator.service");
const readiness_controller_1 = require("./readiness.controller");
const dem_module_1 = require("../dem/dem.module");
const users_module_1 = require("../../users/users.module");
const checklist_status_service_1 = require("./services/checklist-status.service");
const finding_marks_service_1 = require("./services/finding-marks.service");
const packing_list_service_1 = require("./services/packing-list.service");
const packing_template_service_1 = require("./services/packing-template.service");
const solution_service_1 = require("./services/solution.service");
const readiness_ai_service_1 = require("./services/readiness-ai.service");
const readiness_cache_service_1 = require("./services/readiness-cache.service");
const readiness_feature_flags_service_1 = require("./services/readiness-feature-flags.service");
const capability_pack_checklist_service_1 = require("./services/capability-pack-checklist.service");
const coverage_map_service_1 = require("./services/coverage-map.service");
const risk_type_mapper_service_1 = require("./services/risk-type-mapper.service");
const user_decision_service_1 = require("./services/user-decision.service");
const llm_module_1 = require("../../llm/llm.module");
const redis_module_1 = require("../../redis/redis.module");
const rag_module_1 = require("../../rag/rag.module");
let ReadinessModule = class ReadinessModule {
};
exports.ReadinessModule = ReadinessModule;
exports.ReadinessModule = ReadinessModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            users_module_1.UsersModule,
            dem_module_1.DemModule,
            llm_module_1.LlmModule,
            redis_module_1.RedisModule,
            (0, common_1.forwardRef)(() => rag_module_1.RagModule),
        ],
        controllers: [readiness_controller_1.ReadinessController],
        providers: [
            readiness_service_1.ReadinessService,
            readiness_checker_1.ReadinessChecker,
            facts_to_readiness_compiler_1.FactsToReadinessCompiler,
            readiness_to_constraints_compiler_1.ReadinessToConstraintsCompiler,
            pack_storage_service_1.PackStorageService,
            pack_validator_service_1.PackValidatorService,
            geo_facts_river_service_1.GeoFactsRiverService,
            geo_facts_mountain_service_1.GeoFactsMountainService,
            geo_facts_road_service_1.GeoFactsRoadService,
            geo_facts_coastline_service_1.GeoFactsCoastlineService,
            geo_facts_port_service_1.GeoFactsPortService,
            geo_facts_airline_service_1.GeoFactsAirlineService,
            poi_pickup_scorer_service_1.POIPickupScorerService,
            poi_trailhead_service_1.POITrailheadService,
            geo_facts_poi_service_1.GeoFactsPOIService,
            geo_facts_service_1.GeoFactsService,
            geo_facts_cache_service_1.GeoFactsCacheService,
            physical_reality_retrieval_service_1.PhysicalRealityRetrievalService,
            physical_reality_quality_monitor_service_1.PhysicalRealityQualityMonitorService,
            physical_reality_dem_association_service_1.PhysicalRealityDEMAssociationService,
            capability_pack_evaluator_service_1.CapabilityPackEvaluatorService,
            checklist_status_service_1.ChecklistStatusService,
            finding_marks_service_1.FindingMarksService,
            packing_list_service_1.PackingListService,
            packing_template_service_1.PackingTemplateService,
            solution_service_1.SolutionService,
            readiness_ai_service_1.ReadinessAIService,
            readiness_cache_service_1.ReadinessCacheService,
            readiness_feature_flags_service_1.ReadinessFeatureFlagsService,
            capability_pack_checklist_service_1.CapabilityPackChecklistService,
            coverage_map_service_1.CoverageMapService,
            risk_type_mapper_service_1.RiskTypeMapperService,
            user_decision_service_1.UserDecisionService,
        ],
        exports: [
            readiness_service_1.ReadinessService,
            pack_storage_service_1.PackStorageService,
            pack_validator_service_1.PackValidatorService,
            geo_facts_river_service_1.GeoFactsRiverService,
            geo_facts_mountain_service_1.GeoFactsMountainService,
            geo_facts_road_service_1.GeoFactsRoadService,
            geo_facts_coastline_service_1.GeoFactsCoastlineService,
            geo_facts_port_service_1.GeoFactsPortService,
            geo_facts_airline_service_1.GeoFactsAirlineService,
            poi_pickup_scorer_service_1.POIPickupScorerService,
            poi_trailhead_service_1.POITrailheadService,
            geo_facts_poi_service_1.GeoFactsPOIService,
            geo_facts_service_1.GeoFactsService,
            geo_facts_cache_service_1.GeoFactsCacheService,
            physical_reality_retrieval_service_1.PhysicalRealityRetrievalService,
            physical_reality_quality_monitor_service_1.PhysicalRealityQualityMonitorService,
            physical_reality_dem_association_service_1.PhysicalRealityDEMAssociationService,
            capability_pack_evaluator_service_1.CapabilityPackEvaluatorService,
            readiness_ai_service_1.ReadinessAIService,
            readiness_cache_service_1.ReadinessCacheService,
            readiness_feature_flags_service_1.ReadinessFeatureFlagsService,
            user_decision_service_1.UserDecisionService,
        ],
    })
], ReadinessModule);
//# sourceMappingURL=readiness.module.js.map