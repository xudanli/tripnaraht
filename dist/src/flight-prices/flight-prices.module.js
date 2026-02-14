"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlightPricesModule = void 0;
const common_1 = require("@nestjs/common");
const flight_prices_controller_1 = require("./flight-prices.controller");
const flight_price_service_1 = require("../trips/services/flight-price.service");
const flight_price_detail_service_1 = require("../trips/services/flight-price-detail.service");
const flight_price_detail_enhanced_service_1 = require("../trips/services/flight-price-detail-enhanced.service");
const price_prediction_service_1 = require("./services/price-prediction.service");
const prophet_service_1 = require("./services/prophet-service");
const prisma_module_1 = require("../prisma/prisma.module");
let FlightPricesModule = class FlightPricesModule {
};
exports.FlightPricesModule = FlightPricesModule;
exports.FlightPricesModule = FlightPricesModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [flight_prices_controller_1.FlightPricesController],
        providers: [
            flight_price_service_1.FlightPriceService,
            flight_price_detail_service_1.FlightPriceDetailService,
            flight_price_detail_enhanced_service_1.FlightPriceDetailEnhancedService,
            prophet_service_1.ProphetService,
            price_prediction_service_1.PricePredictionService,
        ],
        exports: [
            flight_price_service_1.FlightPriceService,
            flight_price_detail_service_1.FlightPriceDetailService,
            flight_price_detail_enhanced_service_1.FlightPriceDetailEnhancedService,
            prophet_service_1.ProphetService,
        ],
    })
], FlightPricesModule);
//# sourceMappingURL=flight-prices.module.js.map