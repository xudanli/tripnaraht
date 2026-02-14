"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningAssistantModule = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const planning_assistant_service_1 = require("./services/planning-assistant.service");
const planning_assistant_controller_1 = require("./planning-assistant.controller");
const planning_assistant_v2_controller_1 = require("./controllers/planning-assistant-v2.controller");
const planning_assistant_v2_service_1 = require("./services/planning-assistant-v2.service");
const smart_router_service_1 = require("./services/smart-router.service");
const mcp_tool_registry_service_1 = require("./services/mcp-tool-registry.service");
const mcp_tool_dispatcher_service_1 = require("./services/mcp-tool-dispatcher.service");
const llm_tool_selector_service_1 = require("./services/llm-tool-selector.service");
const advanced_geocoding_service_1 = require("./services/advanced-geocoding.service");
const llm_module_1 = require("../../../llm/llm.module");
const prisma_module_1 = require("../../../prisma/prisma.module");
const planning_workbench_agent_service_1 = require("../../services/planning-workbench-agent.service");
const persona_shell_service_1 = require("../../services/persona-shell.service");
const shared_assistants_module_1 = require("../shared/shared-assistants.module");
const infra_module_1 = require("../../infra/infra.module");
const cache_module_1 = require("../../../common/cache/cache.module");
const hotel_direct_module_1 = require("../../../mcp/hotel-direct.module");
const google_maps_direct_module_1 = require("../../../mcp/google-maps-direct.module");
const airbnb_module_1 = require("../../../mcp/airbnb.module");
const restaurant_direct_module_1 = require("../../../mcp/restaurant-direct.module");
const weather_direct_module_1 = require("../../../mcp/weather-direct.module");
const exa_module_1 = require("../../../mcp/exa.module");
const amadeus_module_1 = require("../../../mcp/amadeus.module");
const translation_direct_module_1 = require("../../../mcp/translation-direct.module");
const currency_direct_module_1 = require("../../../mcp/currency-direct.module");
const image_direct_module_1 = require("../../../mcp/image-direct.module");
const vision_module_1 = require("../../../vision/vision.module");
const rail_module_1 = require("../../../mcp/rail.module");
const booking_com_module_1 = require("../../../mcp/booking-com.module");
const google_calendar_module_1 = require("../../../mcp/google-calendar.module");
const isDevelopment = process.env.NODE_ENV !== 'production';
const disableThrottler = process.env.DISABLE_THROTTLER === 'true';
const throttlerConfig = disableThrottler
    ? [{ ttl: 60000, limit: 999999 }]
    : isDevelopment
        ? [{ ttl: 60000, limit: 1000 }]
        : [{ ttl: 60000, limit: 100 }];
let PlanningAssistantModule = class PlanningAssistantModule {
};
exports.PlanningAssistantModule = PlanningAssistantModule;
exports.PlanningAssistantModule = PlanningAssistantModule = __decorate([
    (0, common_1.Module)({
        imports: [
            throttler_1.ThrottlerModule.forRoot(throttlerConfig),
            llm_module_1.LlmModule,
            prisma_module_1.PrismaModule,
            shared_assistants_module_1.SharedAssistantsModule,
            infra_module_1.AgentInfraModule,
            cache_module_1.CacheModule,
            hotel_direct_module_1.HotelDirectModule,
            google_maps_direct_module_1.GoogleMapsDirectModule,
            airbnb_module_1.AirbnbModule,
            restaurant_direct_module_1.RestaurantDirectModule,
            weather_direct_module_1.WeatherDirectModule,
            exa_module_1.ExaModule,
            amadeus_module_1.AmadeusModule,
            translation_direct_module_1.TranslationDirectModule,
            currency_direct_module_1.CurrencyDirectModule,
            image_direct_module_1.ImageDirectModule,
            vision_module_1.VisionModule,
            rail_module_1.RailModule,
            booking_com_module_1.BookingComModule,
            google_calendar_module_1.GoogleCalendarModule,
        ],
        controllers: [
            planning_assistant_controller_1.PlanningAssistantController,
            planning_assistant_v2_controller_1.PlanningAssistantV2Controller,
        ],
        providers: [
            planning_assistant_service_1.PlanningAssistantService,
            planning_assistant_v2_service_1.PlanningAssistantV2Service,
            smart_router_service_1.SmartRouterService,
            mcp_tool_registry_service_1.McpToolRegistryService,
            mcp_tool_dispatcher_service_1.McpToolDispatcherService,
            llm_tool_selector_service_1.LlmToolSelectorService,
            advanced_geocoding_service_1.AdvancedGeocodingService,
            planning_workbench_agent_service_1.PlanningWorkbenchAgentService,
            persona_shell_service_1.PersonaShellService,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
        exports: [
            planning_assistant_service_1.PlanningAssistantService,
            planning_assistant_v2_service_1.PlanningAssistantV2Service,
        ],
    })
], PlanningAssistantModule);
//# sourceMappingURL=planning-assistant.module.js.map