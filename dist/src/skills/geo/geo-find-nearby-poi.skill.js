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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var GeoFindNearbyPOISkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFindNearbyPOISkill = void 0;
const common_1 = require("@nestjs/common");
const places_service_1 = require("../../places/places.service");
const prisma_service_1 = require("../../prisma/prisma.service");
let GeoFindNearbyPOISkill = GeoFindNearbyPOISkill_1 = class GeoFindNearbyPOISkill {
    constructor(placesService, prisma) {
        this.placesService = placesService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(GeoFindNearbyPOISkill_1.name);
        this.MAX_RADIUS = 50 * 1000;
        this.MAX_LIMIT = 100;
        this.metadata = {
            name: 'geo.findNearbyPOI',
            description: '查找附近 POI：带类型/半径/过滤的空间查询，统一 PostGIS 访问的安全出口',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['location', 'radius'],
                typeChecks: {
                    location: {
                        type: 'object',
                    },
                    radius: {
                        type: 'number',
                        min: 0,
                        max: 50000,
                    },
                    limit: {
                        type: 'number',
                        min: 1,
                        max: 100,
                    },
                },
            },
        };
        if (!this.placesService) {
            this.logger.warn('PlacesService 未注入，geo.findNearbyPOI 功能将不可用');
        }
        if (!this.prisma) {
            this.logger.warn('PrismaService 未注入，位置查询功能将受限');
        }
    }
    async execute(input) {
        const startTime = Date.now();
        this.logger.debug(`执行 geo.findNearbyPOI: location=(${input.location.lat}, ${input.location.lng}), radius=${input.radius}m`);
        try {
            const validatedRadius = Math.min(input.radius, this.MAX_RADIUS);
            if (input.radius > this.MAX_RADIUS) {
                this.logger.warn(`搜索半径 ${input.radius}m 超过最大值 ${this.MAX_RADIUS}m，已限制为 ${validatedRadius}m`);
            }
            const validatedLimit = Math.min(input.limit || 50, this.MAX_LIMIT);
            if (input.limit && input.limit > this.MAX_LIMIT) {
                this.logger.warn(`返回数量限制 ${input.limit} 超过最大值 ${this.MAX_LIMIT}，已限制为 ${validatedLimit}`);
            }
            if (!input.location.lat ||
                !input.location.lng ||
                input.location.lat < -90 ||
                input.location.lat > 90 ||
                input.location.lng < -180 ||
                input.location.lng > 180) {
                throw new Error(`无效的位置坐标: (${input.location.lat}, ${input.location.lng})`);
            }
            if (!this.placesService) {
                throw new Error('PlacesService 未注入，无法执行查询');
            }
            let results = [];
            if (input.category && input.category.length === 1) {
                results = await this.placesService.findNearby(input.location.lat, input.location.lng, validatedRadius, input.category[0]);
            }
            else {
                if (input.category && input.category.length > 0) {
                    this.logger.warn(`多个类别过滤暂不支持，使用第一个类别: ${input.category[0]}`);
                    results = await this.placesService.findNearby(input.location.lat, input.location.lng, validatedRadius, input.category[0]);
                }
                else {
                    results = await this.placesService.findNearby(input.location.lat, input.location.lng, validatedRadius);
                }
            }
            let filteredResults = results;
            if (input.filters) {
                filteredResults = results.filter((place) => {
                    var _a;
                    if (input.filters.minRating !== undefined) {
                        if (!place.rating || place.rating < input.filters.minRating) {
                            return false;
                        }
                    }
                    if (input.filters.hasOpeningHours !== undefined) {
                        const hasHours = ((_a = place.status) === null || _a === void 0 ? void 0 : _a.hoursToday) && place.status.hoursToday !== '休息';
                        if (input.filters.hasOpeningHours !== hasHours) {
                            return false;
                        }
                    }
                    if (input.filters.paymentMethods && input.filters.paymentMethods.length > 0) {
                        const placePaymentMethods = place.tags || [];
                        const hasRequiredPayment = input.filters.paymentMethods.some((method) => placePaymentMethods.includes(method));
                        if (!hasRequiredPayment) {
                            return false;
                        }
                    }
                    return true;
                });
            }
            const limitedResults = filteredResults.slice(0, validatedLimit);
            const placeIds = limitedResults.map((p) => p.id);
            const locationMap = new Map();
            if (this.prisma && placeIds.length > 0) {
                const placesWithLocation = await this.prisma.$queryRaw `
          SELECT 
            id,
            ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lng
          FROM "Place"
          WHERE id = ANY(ARRAY[${placeIds.join(',')}]::int[])
        `;
                for (const place of placesWithLocation) {
                    locationMap.set(place.id, {
                        lat: place.lat,
                        lng: place.lng,
                    });
                }
            }
            const pois = limitedResults.map((place) => {
                const location = locationMap.get(place.id) || { lat: 0, lng: 0 };
                return {
                    id: place.id,
                    name: place.name,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN,
                    category: place.category,
                    location,
                    distance: place.distance,
                    rating: place.rating,
                    address: place.address,
                    isOpen: place.isOpen,
                    metadata: place.metadata,
                };
            });
            const queryTime = Date.now() - startTime;
            this.logger.debug(`geo.findNearbyPOI 查询完成: 找到 ${pois.length} 个 POI，耗时 ${queryTime}ms`);
            return {
                pois,
                summary: {
                    totalFound: pois.length,
                    radius: validatedRadius,
                    queryTime,
                },
            };
        }
        catch (error) {
            this.logger.error(`geo.findNearbyPOI 查询失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.GeoFindNearbyPOISkill = GeoFindNearbyPOISkill;
exports.GeoFindNearbyPOISkill = GeoFindNearbyPOISkill = GeoFindNearbyPOISkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [places_service_1.PlacesService,
        prisma_service_1.PrismaService])
], GeoFindNearbyPOISkill);
//# sourceMappingURL=geo-find-nearby-poi.skill.js.map