"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportModule = void 0;
const common_1 = require("@nestjs/common");
const transport_controller_1 = require("./transport.controller");
const transport_decision_service_1 = require("./transport-decision.service");
const transport_routing_service_1 = require("./transport-routing.service");
const google_routes_service_1 = require("./services/google-routes.service");
const amap_routes_service_1 = require("./services/amap-routes.service");
const location_detector_service_1 = require("./services/location-detector.service");
const smart_routes_service_1 = require("./services/smart-routes.service");
const route_cache_service_1 = require("./services/route-cache.service");
const prisma_module_1 = require("../prisma/prisma.module");
const cache_manager_1 = require("@nestjs/cache-manager");
const redis_service_1 = require("../redis/redis.service");
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
    process.env.MCP_MODE === 'true';
const disableRedis = process.env.DISABLE_REDIS === 'true' || isMcpMode;
class MockRedisService {
    async get() { return null; }
    async set() { return Promise.resolve(); }
    async del() { return Promise.resolve(); }
    async exists() { return false; }
    async reset() { return Promise.resolve(); }
    generateKey(prefix, ...parts) {
        return `${prefix}:${parts.join(':')}`;
    }
}
let TransportModule = class TransportModule {
};
exports.TransportModule = TransportModule;
exports.TransportModule = TransportModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            disableRedis
                ? cache_manager_1.CacheModule.register({ ttl: 3600, max: 1000 })
                : (() => {
                    const { RedisModule } = require('../redis/redis.module');
                    return RedisModule;
                })(),
        ],
        controllers: [transport_controller_1.TransportController],
        providers: [
            ...(disableRedis ? [{ provide: redis_service_1.RedisService, useClass: MockRedisService }] : []),
            transport_decision_service_1.TransportDecisionService,
            transport_routing_service_1.TransportRoutingService,
            google_routes_service_1.GoogleRoutesService,
            amap_routes_service_1.AmapRoutesService,
            location_detector_service_1.LocationDetectorService,
            smart_routes_service_1.SmartRoutesService,
            route_cache_service_1.RouteCacheService,
        ],
        exports: [
            transport_decision_service_1.TransportDecisionService,
            transport_routing_service_1.TransportRoutingService,
            smart_routes_service_1.SmartRoutesService,
            route_cache_service_1.RouteCacheService,
        ],
    })
], TransportModule);
//# sourceMappingURL=transport.module.js.map