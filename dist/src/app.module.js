"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const prisma_module_1 = require("./prisma/prisma.module");
const places_module_1 = require("./places/places.module");
const trips_module_1 = require("./trips/trips.module");
const itinerary_items_module_1 = require("./itinerary-items/itinerary-items.module");
const countries_module_1 = require("./countries/countries.module");
const transport_module_1 = require("./transport/transport.module");
const flight_prices_module_1 = require("./flight-prices/flight-prices.module");
const itinerary_optimization_module_1 = require("./itinerary-optimization/itinerary-optimization.module");
const hotels_module_1 = require("./hotels/hotels.module");
const redis_module_1 = require("./redis/redis.module");
const planning_policy_module_1 = require("./planning-policy/planning-policy.module");
const schedule_action_module_1 = require("./schedule-action/schedule-action.module");
const system_module_1 = require("./system/system.module");
const users_module_1 = require("./users/users.module");
const llm_module_1 = require("./llm/llm.module");
const agent_module_1 = require("./agent/agent.module");
const railpass_module_1 = require("./railpass/railpass.module");
const dem_module_1 = require("./trips/dem/dem.module");
const data_contracts_module_1 = require("./data-contracts/data-contracts.module");
const route_directions_module_1 = require("./route-directions/route-directions.module");
const rag_module_1 = require("./rag/rag.module");
const upload_module_1 = require("./upload/upload.module");
const auth_module_1 = require("./auth/auth.module");
const contact_module_1 = require("./contact/contact.module");
const cities_module_1 = require("./cities/cities.module");
const weather_module_1 = require("./weather/weather.module");
const iceland_info_module_1 = require("./iceland-info/iceland-info.module");
const data_quality_module_1 = require("./data-quality/data-quality.module");
const data_privacy_module_1 = require("./data-privacy/data-privacy.module");
const data_pipeline_module_1 = require("./data-pipeline/data-pipeline.module");
const data_modeling_module_1 = require("./data-modeling/data-modeling.module");
const data_architecture_module_1 = require("./data-architecture/data-architecture.module");
const content_strategy_module_1 = require("./content-strategy/content-strategy.module");
const context_engine_module_1 = require("./agent/context-engine/context-engine.module");
const chain_of_work_module_1 = require("./chain-of-work/chain-of-work.module");
const decision_draft_module_1 = require("./decision-draft/decision-draft.module");
const admin_module_1 = require("./admin/admin.module");
const airbnb_module_1 = require("./mcp/airbnb.module");
const amadeus_module_1 = require("./mcp/amadeus.module");
const exa_module_1 = require("./mcp/exa.module");
const google_calendar_module_1 = require("./mcp/google-calendar.module");
const booking_com_module_1 = require("./mcp/booking-com.module");
const postgresql_mcp_module_1 = require("./mcp/postgresql-mcp.module");
const browserbase_mcp_module_1 = require("./mcp/browserbase-mcp.module");
const google_maps_direct_module_1 = require("./mcp/google-maps-direct.module");
const stripe_direct_module_1 = require("./mcp/stripe-direct.module");
const restaurant_direct_module_1 = require("./mcp/restaurant-direct.module");
const currency_direct_module_1 = require("./mcp/currency-direct.module");
const hotel_direct_module_1 = require("./mcp/hotel-direct.module");
const translation_direct_module_1 = require("./mcp/translation-direct.module");
const image_direct_module_1 = require("./mcp/image-direct.module");
const file_extractor_mcp_module_1 = require("./mcp/file-extractor-mcp.module");
const file_extractor_direct_module_1 = require("./mcp/file-extractor-direct.module");
const mcp_oauth_module_1 = require("./mcp/mcp-oauth.module");
const mcp_capability_module_1 = require("./mcp/mcp-capability.module");
const analytics_module_1 = require("./analytics/analytics.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
            }),
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            redis_module_1.RedisModule,
            data_contracts_module_1.DataContractsModule,
            data_quality_module_1.DataQualityModule,
            data_privacy_module_1.DataPrivacyModule,
            data_pipeline_module_1.DataPipelineModule,
            data_modeling_module_1.DataModelingModule,
            data_architecture_module_1.DataArchitectureModule,
            content_strategy_module_1.ContentStrategyModule,
            system_module_1.SystemModule,
            contact_module_1.ContactModule,
            users_module_1.UsersModule,
            countries_module_1.CountriesModule,
            cities_module_1.CitiesModule,
            weather_module_1.WeatherModule,
            iceland_info_module_1.IcelandInfoModule,
            llm_module_1.LlmModule,
            places_module_1.PlacesModule,
            flight_prices_module_1.FlightPricesModule,
            hotels_module_1.HotelsModule,
            itinerary_items_module_1.ItineraryItemsModule,
            itinerary_optimization_module_1.ItineraryOptimizationModule,
            planning_policy_module_1.PlanningPolicyModule,
            transport_module_1.TransportModule,
            schedule_action_module_1.ScheduleActionModule,
            trips_module_1.TripsModule,
            railpass_module_1.RailPassModule,
            dem_module_1.DemModule,
            route_directions_module_1.RouteDirectionsModule,
            rag_module_1.RagModule,
            agent_module_1.AgentModule,
            context_engine_module_1.ContextEngineModule,
            upload_module_1.UploadModule,
            chain_of_work_module_1.ChainOfWorkModule,
            decision_draft_module_1.DecisionDraftModule,
            admin_module_1.AdminModule,
            airbnb_module_1.AirbnbModule,
            amadeus_module_1.AmadeusModule,
            exa_module_1.ExaModule,
            google_calendar_module_1.GoogleCalendarModule,
            booking_com_module_1.BookingComModule,
            postgresql_mcp_module_1.PostgreSQLMcpModule,
            browserbase_mcp_module_1.BrowserbaseMcpModule,
            google_maps_direct_module_1.GoogleMapsDirectModule,
            stripe_direct_module_1.StripeDirectModule,
            restaurant_direct_module_1.RestaurantDirectModule,
            currency_direct_module_1.CurrencyDirectModule,
            hotel_direct_module_1.HotelDirectModule,
            translation_direct_module_1.TranslationDirectModule,
            image_direct_module_1.ImageDirectModule,
            file_extractor_mcp_module_1.FileExtractorMcpModule,
            file_extractor_direct_module_1.FileExtractorDirectModule,
            mcp_oauth_module_1.McpOAuthModule,
            mcp_capability_module_1.McpCapabilityModule,
            analytics_module_1.AnalyticsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map