"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotelsModule = void 0;
const common_1 = require("@nestjs/common");
const hotels_controller_1 = require("./hotels.controller");
const hotel_price_service_1 = require("./services/hotel-price.service");
const hotel_price_prediction_service_1 = require("./services/hotel-price-prediction.service");
const flight_prices_module_1 = require("../flight-prices/flight-prices.module");
const prisma_module_1 = require("../prisma/prisma.module");
let HotelsModule = class HotelsModule {
};
exports.HotelsModule = HotelsModule;
exports.HotelsModule = HotelsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, flight_prices_module_1.FlightPricesModule],
        controllers: [hotels_controller_1.HotelsController],
        providers: [hotel_price_service_1.HotelPriceService, hotel_price_prediction_service_1.HotelPricePredictionService],
        exports: [hotel_price_service_1.HotelPriceService],
    })
], HotelsModule);
//# sourceMappingURL=hotels.module.js.map