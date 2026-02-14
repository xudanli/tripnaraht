"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.POIModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../prisma/prisma.module");
const poi_layer_service_1 = require("./services/poi-layer.service");
const poi_route_affinity_service_1 = require("./services/poi-route-affinity.service");
let POIModule = class POIModule {
};
exports.POIModule = POIModule;
exports.POIModule = POIModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        providers: [poi_layer_service_1.POILayerService, poi_route_affinity_service_1.POIRouteAffinityService],
        exports: [poi_layer_service_1.POILayerService, poi_route_affinity_service_1.POIRouteAffinityService],
    })
], POIModule);
//# sourceMappingURL=poi.module.js.map