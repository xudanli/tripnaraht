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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteOptimizationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const route_optimizer_service_1 = require("./services/route-optimizer.service");
const client_1 = require("@prisma/client");
let RouteOptimizationService = class RouteOptimizationService {
    constructor(prisma, optimizerService) {
        this.prisma = prisma;
        this.optimizerService = optimizerService;
    }
    async optimizeRoute(dto) {
        const places = await this.prisma.place.findMany({
            where: {
                id: { in: dto.placeIds },
            },
            include: {
                City: true,
            },
        });
        if (places.length === 0) {
            throw new common_1.NotFoundException('未找到指定的地点');
        }
        if (places.length !== dto.placeIds.length) {
            const foundIds = places.map((p) => p.id);
            const missingIds = dto.placeIds.filter((id) => !foundIds.includes(id));
            throw new common_1.NotFoundException(`以下地点不存在：${missingIds.join(', ')}`);
        }
        const placesWithLocation = await Promise.all(places.map(async (place) => {
            const locationResult = await this.prisma.$queryRaw `
          SELECT 
            ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lng
          FROM "Place"
          WHERE id = ${place.id}
        `;
            if (locationResult.length > 0 && locationResult[0].lat && locationResult[0].lng) {
                return {
                    placeId: place.id,
                    location: {
                        lat: locationResult[0].lat,
                        lng: locationResult[0].lng,
                    },
                };
            }
            const metadata = place.metadata || {};
            if (metadata.location) {
                return {
                    placeId: place.id,
                    location: metadata.location,
                };
            }
            return null;
        }));
        const placeNodes = places.map((place) => {
            var _a, _b;
            const metadata = place.metadata || {};
            const physicalMetadata = place.physicalMetadata || {};
            const placeWithLoc = placesWithLocation.find((p) => p && p.placeId === place.id);
            const location = (placeWithLoc === null || placeWithLoc === void 0 ? void 0 : placeWithLoc.location) || { lat: 0, lng: 0 };
            let intensity = 'MEDIUM';
            if (physicalMetadata.intensity_factor) {
                if (physicalMetadata.intensity_factor >= 1.5)
                    intensity = 'HIGH';
                else if (physicalMetadata.intensity_factor <= 0.5)
                    intensity = 'LOW';
            }
            const isRestaurant = place.category === client_1.PlaceCategory.RESTAURANT;
            return {
                id: place.id,
                name: place.nameEN || place.nameCN,
                category: place.category,
                location,
                physicalMetadata: physicalMetadata,
                intensity,
                estimatedDuration: physicalMetadata.estimated_duration_min || 60,
                openingHours: metadata.openingHours
                    ? {
                        start: (_a = metadata.openingHours.mon) === null || _a === void 0 ? void 0 : _a.split('-')[0],
                        end: (_b = metadata.openingHours.mon) === null || _b === void 0 ? void 0 : _b.split('-')[1],
                    }
                    : undefined,
                isRestaurant,
                isRest: false,
            };
        });
        const config = {
            date: dto.config.date,
            startTime: dto.config.startTime,
            endTime: dto.config.endTime,
            pacingFactor: dto.config.pacingFactor || 1.0,
            hasChildren: dto.config.hasChildren || false,
            hasElderly: dto.config.hasElderly || false,
            lunchWindow: dto.config.lunchWindow,
            dinnerWindow: dto.config.dinnerWindow,
            useVRPTW: dto.config.useVRPTW || false,
            clustering: {
                minPoints: 2,
                epsilon: 2000,
            },
        };
        return this.optimizerService.optimizeRoute(placeNodes, config);
    }
};
exports.RouteOptimizationService = RouteOptimizationService;
exports.RouteOptimizationService = RouteOptimizationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        route_optimizer_service_1.RouteOptimizerService])
], RouteOptimizationService);
//# sourceMappingURL=itinerary-optimization.service.js.map