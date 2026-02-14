"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingComModule = void 0;
const common_1 = require("@nestjs/common");
const booking_com_controller_1 = require("./booking-com.controller");
const booking_com_service_1 = require("./booking-com.service");
const booking_com_integration_service_1 = require("./booking-com-integration.service");
const booking_com_monitoring_service_1 = require("./booking-com-monitoring.service");
const redis_module_1 = require("../redis/redis.module");
let BookingComModule = class BookingComModule {
};
exports.BookingComModule = BookingComModule;
exports.BookingComModule = BookingComModule = __decorate([
    (0, common_1.Module)({
        imports: [redis_module_1.RedisModule],
        controllers: [booking_com_controller_1.BookingComController],
        providers: [booking_com_service_1.BookingComService, booking_com_integration_service_1.BookingComIntegrationService, booking_com_monitoring_service_1.BookingComMonitoringService],
        exports: [booking_com_service_1.BookingComService, booking_com_integration_service_1.BookingComIntegrationService, booking_com_monitoring_service_1.BookingComMonitoringService],
    })
], BookingComModule);
//# sourceMappingURL=booking-com.module.js.map