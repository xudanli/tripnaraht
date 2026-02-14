"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionsModule = void 0;
const common_1 = require("@nestjs/common");
const route_directions_controller_1 = require("./route-directions.controller");
const route_directions_service_1 = require("./route-directions.service");
const route_direction_selector_service_1 = require("./services/route-direction-selector.service");
const route_direction_poi_generator_service_1 = require("./services/route-direction-poi-generator.service");
const route_direction_observability_service_1 = require("./services/route-direction-observability.service");
const route_direction_cache_service_1 = require("./services/route-direction-cache.service");
const route_direction_card_service_1 = require("./services/route-direction-card.service");
const route_direction_explainer_service_1 = require("./services/route-direction-explainer.service");
const pack_kpi_acceptance_service_1 = require("./services/pack-kpi-acceptance.service");
const route_judgment_service_1 = require("./services/route-judgment.service");
const enhanced_risk_assessment_service_1 = require("./services/enhanced-risk-assessment.service");
const result_presentation_service_1 = require("./services/result-presentation.service");
const compliance_plugin_service_1 = require("./plugins/compliance-plugin.service");
const transport_plugin_service_1 = require("./plugins/transport-plugin.service");
const common_2 = require("@nestjs/common");
const decision_module_1 = require("../trips/decision/decision.module");
const prisma_module_1 = require("../prisma/prisma.module");
const poi_module_1 = require("../poi/poi.module");
const cache_manager_1 = require("@nestjs/cache-manager");
const redis_service_1 = require("../redis/redis.service");
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
    process.env.MCP_MODE === 'true';
const disableRedis = process.env.DISABLE_REDIS === 'true' || isMcpMode;
class MockRedisService {
    async get() { return null; }
    async set() { return Promise.resolve(); }
    async del() { return Promise.resolve(); }
    async exists() { return false; }
    async reset() { return Promise.resolve(); }
    generateKey(prefix, ...parts) {
        return `${prefix}:${parts.join(':')}`;
    }
}
let RouteDirectionsModule = class RouteDirectionsModule {
};
exports.RouteDirectionsModule = RouteDirectionsModule;
exports.RouteDirectionsModule = RouteDirectionsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            disableRedis
                ? cache_manager_1.CacheModule.register({ ttl: 3600, max: 1000 })
                : (() => {
                    const { RedisModule } = require('../redis/redis.module');
                    return RedisModule;
                })(),
            poi_module_1.POIModule,
            (0, common_2.forwardRef)(() => decision_module_1.DecisionModule),
        ],
        controllers: [route_directions_controller_1.RouteDirectionsController],
        providers: [
            ...(disableRedis ? [{ provide: redis_service_1.RedisService, useClass: MockRedisService }] : []),
            route_directions_service_1.RouteDirectionsService,
            route_direction_selector_service_1.RouteDirectionSelectorService,
            route_direction_poi_generator_service_1.RouteDirectionPoiGeneratorService,
            route_direction_observability_service_1.RouteDirectionObservabilityService,
            route_direction_cache_service_1.RouteDirectionCacheService,
            route_direction_card_service_1.RouteDirectionCardService,
            compliance_plugin_service_1.CompliancePluginService,
            transport_plugin_service_1.TransportPluginService,
            route_direction_explainer_service_1.RouteDirectionExplainerService,
            pack_kpi_acceptance_service_1.PackKPIAcceptanceService,
            route_judgment_service_1.RouteJudgmentService,
            enhanced_risk_assessment_service_1.EnhancedRiskAssessmentService,
            result_presentation_service_1.ResultPresentationService,
        ],
        exports: [
            route_directions_service_1.RouteDirectionsService,
            route_direction_selector_service_1.RouteDirectionSelectorService,
            route_direction_poi_generator_service_1.RouteDirectionPoiGeneratorService,
            route_direction_observability_service_1.RouteDirectionObservabilityService,
            route_direction_cache_service_1.RouteDirectionCacheService,
            route_direction_card_service_1.RouteDirectionCardService,
            compliance_plugin_service_1.CompliancePluginService,
            transport_plugin_service_1.TransportPluginService,
            route_direction_explainer_service_1.RouteDirectionExplainerService,
            pack_kpi_acceptance_service_1.PackKPIAcceptanceService,
            route_judgment_service_1.RouteJudgmentService,
            enhanced_risk_assessment_service_1.EnhancedRiskAssessmentService,
            result_presentation_service_1.ResultPresentationService,
        ],
    })
], RouteDirectionsModule);
//# sourceMappingURL=route-directions.module.js.map