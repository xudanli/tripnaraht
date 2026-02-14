"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrailsModule = void 0;
const common_1 = require("@nestjs/common");
const trails_service_1 = require("./trails.service");
const trails_controller_1 = require("./trails.controller");
const prisma_module_1 = require("../prisma/prisma.module");
const trail_support_services_service_1 = require("./services/trail-support-services.service");
const trail_cache_service_1 = require("./services/trail-cache.service");
const smart_trail_planner_service_1 = require("./services/smart-trail-planner.service");
const trail_tracking_service_1 = require("./services/trail-tracking.service");
let TrailsModule = class TrailsModule {
};
exports.TrailsModule = TrailsModule;
exports.TrailsModule = TrailsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [trails_controller_1.TrailsController],
        providers: [trails_service_1.TrailsService, trail_support_services_service_1.TrailSupportServicesService, trail_cache_service_1.TrailCacheService, smart_trail_planner_service_1.SmartTrailPlannerService, trail_tracking_service_1.TrailTrackingService],
        exports: [trails_service_1.TrailsService, trail_support_services_service_1.TrailSupportServicesService, trail_cache_service_1.TrailCacheService, smart_trail_planner_service_1.SmartTrailPlannerService, trail_tracking_service_1.TrailTrackingService],
    })
], TrailsModule);
//# sourceMappingURL=trails.module.js.map