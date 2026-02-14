"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExaModule = void 0;
const common_1 = require("@nestjs/common");
const exa_controller_1 = require("./exa.controller");
const exa_service_1 = require("./exa.service");
const exa_integration_service_1 = require("./exa-integration.service");
const exa_monitoring_service_1 = require("./exa-monitoring.service");
const redis_module_1 = require("../redis/redis.module");
let ExaModule = class ExaModule {
};
exports.ExaModule = ExaModule;
exports.ExaModule = ExaModule = __decorate([
    (0, common_1.Module)({
        imports: [redis_module_1.RedisModule],
        controllers: [exa_controller_1.ExaController],
        providers: [exa_service_1.ExaService, exa_integration_service_1.ExaIntegrationService, exa_monitoring_service_1.ExaMonitoringService],
        exports: [exa_service_1.ExaService, exa_integration_service_1.ExaIntegrationService, exa_monitoring_service_1.ExaMonitoringService],
    })
], ExaModule);
//# sourceMappingURL=exa.module.js.map