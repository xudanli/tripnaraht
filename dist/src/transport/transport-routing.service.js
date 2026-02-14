"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TransportRoutingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportRoutingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const transport_interface_1 = require("./interfaces/transport.interface");
const transport_decision_service_1 = require("./transport-decision.service");
const smart_routes_service_1 = require("./services/smart-routes.service");
const route_cache_service_1 = require("./services/route-cache.service");
let TransportRoutingService = TransportRoutingService_1 = class TransportRoutingService {
    constructor(prisma, decisionService, smartRoutesService, routeCacheService) {
        this.prisma = prisma;
        this.decisionService = decisionService;
        this.smartRoutesService = smartRoutesService;
        this.routeCacheService = routeCacheService;
        this.logger = new common_1.Logger(TransportRoutingService_1.name);
    }
    async planRoute(fromLat, fromLng, toLat, toLng, context) {
        const distance = this.calculateDistance(fromLat, fromLng, toLat, toLng);
        const isInterCity = distance > 50;
        if (isInterCity) {
            return this.planInterCityRoute(fromLat, fromLng, toLat, toLng, context);
        }
        else {
            return this.planIntraCityRoute(fromLat, fromLng, toLat, toLng, context);
        }
    }
    async planInterCityRoute(fromLat, fromLng, toLat, toLng, context) {
        const distance = this.calculateDistance(fromLat, fromLng, toLat, toLng);
        const options = [];
        const railOption = {
            mode: transport_interface_1.TransportMode.RAIL,
            durationMinutes: this.estimateRailTime(distance),
            cost: this.estimateRailCost(distance),
            walkDistance: 500,
            description: '铁路/高铁：准时、市中心对市中心',
        };
        options.push(railOption);
        if (context.budgetSensitivity === 'HIGH' || distance > 300) {
            const busOption = {
                mode: transport_interface_1.TransportMode.BUS,
                durationMinutes: this.estimateBusTime(distance),
                cost: this.estimateBusCost(distance),
                walkDistance: 300,
                description: distance > 500
                    ? '夜行巴士：省一晚房费，适合年轻人'
                    : '长途巴士：经济实惠',
            };
            options.push(busOption);
        }
        if (context.timeSensitivity === 'HIGH' && distance > 500) {
            const flightTime = this.estimateFlightTime(distance);
            const railTime = railOption.durationMinutes;
            const totalFlightTime = flightTime + 120;
            if (totalFlightTime < railTime) {
                const flightOption = {
                    mode: transport_interface_1.TransportMode.FLIGHT,
                    durationMinutes: totalFlightTime,
                    cost: this.estimateFlightCost(distance),
                    walkDistance: 1000,
                    description: '飞机：最快，但需考虑机场通勤时间',
                };
                options.push(flightOption);
            }
        }
        return this.decisionService.rankOptions(options, context);
    }
    async planIntraCityRoute(fromLat, fromLng, toLat, toLng, context) {
        const distance = this.calculateDistance(fromLat, fromLng, toLat, toLng);
        const distanceMeters = distance * 1000;
        const options = [];
        const isShortDistance = this.routeCacheService.isShortDistance(distanceMeters);
        if (context.isMovingDay && context.hasLuggage) {
            const taxiOption = {
                mode: transport_interface_1.TransportMode.TAXI,
                durationMinutes: this.estimateTaxiTime(distanceMeters),
                cost: this.estimateTaxiCost(distanceMeters),
                walkDistance: 0,
                description: '打车：门到门，适合换酒店日',
            };
            options.push(taxiOption);
            const transitOption = {
                mode: transport_interface_1.TransportMode.TRANSIT,
                durationMinutes: this.estimateTransitTime(distanceMeters),
                cost: this.estimateTransitCost(distanceMeters),
                walkDistance: 800,
                transfers: this.estimateTransfers(distanceMeters),
                description: '公共交通：不推荐（携带大件行李）',
            };
            options.push(transitOption);
            return this.decisionService.rankOptions(options, context);
        }
        if (distanceMeters < 1500 &&
            !context.isRaining &&
            !context.hasElderly &&
            !context.hasLuggage) {
            const walkDuration = isShortDistance
                ? await this.routeCacheService.calculateShortDistanceWalkTime(fromLat, fromLng, toLat, toLng)
                : Math.round(distanceMeters / 80);
            const walkOption = {
                mode: transport_interface_1.TransportMode.WALKING,
                durationMinutes: walkDuration,
                cost: 0,
                walkDistance: distanceMeters,
                description: '步行：免费，距离较近',
            };
            options.push(walkOption);
        }
        if (distanceMeters > 1500 || !context.hasLuggage) {
            let transitOptions = [];
            if (!isShortDistance) {
                const cachedRoute = await this.routeCacheService.getCachedRoute(fromLat, fromLng, toLat, toLng, 'TRANSIT');
                if (cachedRoute) {
                    transitOptions = cachedRoute;
                }
                else {
                    const routeOptions = await this.smartRoutesService.getRoutes(fromLat, fromLng, toLat, toLng, 'TRANSIT', {
                        lessWalking: context.hasElderly || context.hasLimitedMobility,
                    });
                    if (routeOptions.length > 0) {
                        transitOptions = routeOptions;
                        await this.routeCacheService.saveCachedRoute(fromLat, fromLng, toLat, toLng, 'TRANSIT', routeOptions);
                    }
                }
            }
            if (transitOptions.length === 0) {
                const transitOption = {
                    mode: transport_interface_1.TransportMode.TRANSIT,
                    durationMinutes: this.estimateTransitTime(distanceMeters),
                    cost: this.estimateTransitCost(distanceMeters),
                    walkDistance: 500,
                    transfers: this.estimateTransfers(distanceMeters),
                    description: '公共交通：经济实惠',
                };
                transitOptions.push(transitOption);
            }
            options.push(...transitOptions);
        }
        let taxiOptions = [];
        if (!isShortDistance) {
            const routeOptions = await this.smartRoutesService.getRoutes(fromLat, fromLng, toLat, toLng, 'DRIVING');
            if (routeOptions.length > 0) {
                taxiOptions = routeOptions;
            }
        }
        if (taxiOptions.length === 0) {
            const taxiOption = {
                mode: transport_interface_1.TransportMode.TAXI,
                durationMinutes: this.estimateTaxiTime(distanceMeters),
                cost: this.estimateTaxiCost(distanceMeters),
                walkDistance: 0,
                description: '打车：门到门，最方便',
            };
            taxiOptions.push(taxiOption);
        }
        options.push(...taxiOptions);
        return this.decisionService.rankOptions(options, context);
    }
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        return distance;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    estimateRailTime(distanceKm) {
        return Math.round((distanceKm / 250) * 60);
    }
    estimateRailCost(distanceKm) {
        return Math.round(distanceKm * 0.5);
    }
    estimateBusTime(distanceKm) {
        return Math.round((distanceKm / 80) * 60);
    }
    estimateBusCost(distanceKm) {
        return Math.round(distanceKm * 0.2);
    }
    estimateFlightTime(distanceKm) {
        return Math.round((distanceKm / 600) * 60);
    }
    estimateFlightCost(distanceKm) {
        return Math.round(distanceKm * 1);
    }
    estimateTransitTime(distanceMeters) {
        return Math.round((distanceMeters / 1000 / 30) * 60);
    }
    estimateTransitCost(distanceMeters) {
        if (distanceMeters < 5000) {
            return 3;
        }
        return 3 + Math.floor((distanceMeters - 5000) / 5000) * 2;
    }
    estimateTransfers(distanceMeters) {
        return Math.floor(distanceMeters / 10000);
    }
    estimateTaxiTime(distanceMeters) {
        return Math.round((distanceMeters / 1000 / 25) * 60);
    }
    estimateTaxiCost(distanceMeters) {
        const distanceKm = distanceMeters / 1000;
        return Math.round(15 + distanceKm * 3);
    }
};
exports.TransportRoutingService = TransportRoutingService;
exports.TransportRoutingService = TransportRoutingService = TransportRoutingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        transport_decision_service_1.TransportDecisionService,
        smart_routes_service_1.SmartRoutesService,
        route_cache_service_1.RouteCacheService])
], TransportRoutingService);
//# sourceMappingURL=transport-routing.service.js.map