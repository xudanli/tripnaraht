"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItineraryItemsModule = void 0;
const common_1 = require("@nestjs/common");
const itinerary_items_service_1 = require("./itinerary-items.service");
const itinerary_items_controller_1 = require("./itinerary-items.controller");
const itinerary_validation_service_1 = require("./services/itinerary-validation.service");
const travel_time_cache_service_1 = require("./services/travel-time-cache.service");
const item_cost_service_1 = require("./services/item-cost.service");
const time_overlap_validator_1 = require("./validators/time-overlap.validator");
const travel_time_validator_1 = require("./validators/travel-time.validator");
const buffer_time_validator_1 = require("./validators/buffer-time.validator");
const prisma_module_1 = require("../prisma/prisma.module");
const transport_module_1 = require("../transport/transport.module");
const places_module_1 = require("../places/places.module");
const google_maps_direct_module_1 = require("../mcp/google-maps-direct.module");
let ItineraryItemsModule = class ItineraryItemsModule {
};
exports.ItineraryItemsModule = ItineraryItemsModule;
exports.ItineraryItemsModule = ItineraryItemsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            transport_module_1.TransportModule,
            (0, common_1.forwardRef)(() => places_module_1.PlacesModule),
            google_maps_direct_module_1.GoogleMapsDirectModule,
        ],
        controllers: [itinerary_items_controller_1.ItineraryItemsController],
        providers: [
            itinerary_items_service_1.ItineraryItemsService,
            itinerary_validation_service_1.ItineraryValidationService,
            travel_time_cache_service_1.TravelTimeCacheService,
            item_cost_service_1.ItemCostService,
            time_overlap_validator_1.TimeOverlapValidator,
            travel_time_validator_1.TravelTimeValidator,
            buffer_time_validator_1.BufferTimeValidator,
        ],
        exports: [itinerary_items_service_1.ItineraryItemsService, itinerary_validation_service_1.ItineraryValidationService, item_cost_service_1.ItemCostService],
    })
], ItineraryItemsModule);
//# sourceMappingURL=itinerary-items.module.js.map