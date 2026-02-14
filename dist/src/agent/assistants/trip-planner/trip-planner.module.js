"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripPlannerModule = void 0;
const common_1 = require("@nestjs/common");
const trip_planner_service_1 = require("./services/trip-planner.service");
const context_analyzer_service_1 = require("./services/context-analyzer.service");
const intent_disambiguator_service_1 = require("./services/intent-disambiguator.service");
const route_optimization_service_1 = require("./services/route-optimization.service");
const trip_planner_feedback_service_1 = require("./services/trip-planner-feedback.service");
const prompt_service_1 = require("./services/prompt.service");
const gap_preferences_service_1 = require("./services/gap-preferences.service");
const prisma_module_1 = require("../../../prisma/prisma.module");
const llm_module_1 = require("../../../llm/llm.module");
const dem_module_1 = require("../../../trips/dem/dem.module");
const agent_module_1 = require("../../agent.module");
const rag_module_1 = require("../../../rag/rag.module");
const itinerary_verify_skill_1 = require("../../../skills/itinerary/itinerary-verify.skill");
const transport_search_skill_1 = require("../../../skills/transport/transport-search.skill");
const opening_hours_get_skill_1 = require("../../../skills/places/opening-hours-get.skill");
const dem_get_profile_skill_1 = require("../../../skills/dem/dem-get-profile.skill");
const geo_check_hazard_zones_skill_1 = require("../../../skills/geo/geo-check-hazard-zones.skill");
let TripPlannerModule = class TripPlannerModule {
};
exports.TripPlannerModule = TripPlannerModule;
exports.TripPlannerModule = TripPlannerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            llm_module_1.LlmModule,
            dem_module_1.DemModule,
            (0, common_1.forwardRef)(() => rag_module_1.RagModule),
            (0, common_1.forwardRef)(() => agent_module_1.AgentModule),
        ],
        controllers: [],
        providers: [
            trip_planner_service_1.TripPlannerService,
            context_analyzer_service_1.ContextAnalyzerService,
            intent_disambiguator_service_1.IntentDisambiguatorService,
            route_optimization_service_1.RouteOptimizationService,
            trip_planner_feedback_service_1.TripPlannerFeedbackService,
            prompt_service_1.PromptService,
            gap_preferences_service_1.GapPreferencesService,
            itinerary_verify_skill_1.ItineraryVerifySkill,
            transport_search_skill_1.TransportSearchSkill,
            opening_hours_get_skill_1.OpeningHoursGetSkill,
            dem_get_profile_skill_1.DemGetProfileSkill,
            geo_check_hazard_zones_skill_1.GeoCheckHazardZonesSkill,
        ],
        exports: [
            trip_planner_service_1.TripPlannerService,
            context_analyzer_service_1.ContextAnalyzerService,
            intent_disambiguator_service_1.IntentDisambiguatorService,
            route_optimization_service_1.RouteOptimizationService,
            trip_planner_feedback_service_1.TripPlannerFeedbackService,
        ],
    })
], TripPlannerModule);
//# sourceMappingURL=trip-planner.module.js.map