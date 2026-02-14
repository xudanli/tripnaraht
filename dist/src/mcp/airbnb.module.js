"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirbnbModule = void 0;
const common_1 = require("@nestjs/common");
const airbnb_controller_1 = require("./airbnb.controller");
const airbnb_service_1 = require("./airbnb.service");
const airbnb_integration_service_1 = require("./airbnb-integration.service");
const airbnb_monitoring_service_1 = require("./airbnb-monitoring.service");
const redis_module_1 = require("../redis/redis.module");
let AirbnbModule = class AirbnbModule {
};
exports.AirbnbModule = AirbnbModule;
exports.AirbnbModule = AirbnbModule = __decorate([
    (0, common_1.Module)({
        imports: [redis_module_1.RedisModule],
        controllers: [airbnb_controller_1.AirbnbController],
        providers: [airbnb_service_1.AirbnbService, airbnb_integration_service_1.AirbnbIntegrationService, airbnb_monitoring_service_1.AirbnbMonitoringService],
        exports: [airbnb_service_1.AirbnbService, airbnb_integration_service_1.AirbnbIntegrationService, airbnb_monitoring_service_1.AirbnbMonitoringService],
    })
], AirbnbModule);
//# sourceMappingURL=airbnb.module.js.map