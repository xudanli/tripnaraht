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
var GeoFactsCoastlineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFactsCoastlineService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let GeoFactsCoastlineService = GeoFactsCoastlineService_1 = class GeoFactsCoastlineService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GeoFactsCoastlineService_1.name);
    }
    async getCoastlineFeaturesForPoint(lat, lng, nearCoastlineThresholdKm = 5, coastalAreaThresholdKm = 50, densityBufferKm = 10) {
        try {
            const nearestDistance = await this.getNearestCoastlineDistance(lat, lng);
            const densityScore = await this.getCoastlineDensityScore(lat, lng, densityBufferKm);
            const nearCoastlineThresholdM = nearCoastlineThresholdKm * 1000;
            const coastalAreaThresholdM = coastalAreaThresholdKm * 1000;
            return {
                nearestCoastlineDistanceM: nearestDistance,
                nearCoastline: nearestDistance !== null && nearestDistance <= nearCoastlineThresholdM,
                isCoastalArea: nearestDistance !== null && nearestDistance <= coastalAreaThresholdM,
                coastlineDensityScore: densityScore,
            };
        }
        catch (error) {
            this.logger.error(`获取点位海岸线特征失败 (${lat}, ${lng}):`, error);
            return {
                nearestCoastlineDistanceM: null,
                nearCoastline: false,
                isCoastalArea: false,
                coastlineDensityScore: 0,
            };
        }
    }
    async getCoastlineFeaturesForRoute(route, nearCoastlineThresholdKm = 5, coastalAreaThresholdKm = 50, densityBufferKm = 10) {
        try {
            if (!route.points || route.points.length === 0) {
                return this.getEmptyFeatures();
            }
            const centerPoint = this.getRouteCenter(route.points);
            return await this.getCoastlineFeaturesForPoint(centerPoint.lat, centerPoint.lng, nearCoastlineThresholdKm, coastalAreaThresholdKm, densityBufferKm);
        }
        catch (error) {
            this.logger.error('获取路线海岸线特征失败:', error);
            return this.getEmptyFeatures();
        }
    }
    async getNearestCoastlineDistance(lat, lng) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM geo_coastlines
        WHERE geom IS NOT NULL
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `;
            if (result.length === 0) {
                return null;
            }
            return Math.round(result[0].distance_m);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                this.logger.warn('geo_coastlines 表不存在，请先导入海岸线数据');
                return null;
            }
            throw error;
        }
    }
    async getCoastlineDensityScore(lat, lng, bufferKm) {
        var _a;
        try {
            const bufferMeters = bufferKm * 1000;
            const result = await this.prisma.$queryRaw `
        SELECT 
          COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m
        FROM geo_coastlines
        WHERE geom IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferMeters}
          );
      `;
            const totalLengthM = Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.total_length_m) || 0);
            const score = Math.min(totalLengthM / 20000, 1.0);
            return Math.round(score * 100) / 100;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                return 0;
            }
            throw error;
        }
    }
    getRouteCenter(points) {
        if (points.length === 0) {
            throw new Error('路线点序列为空');
        }
        if (points.length === 1) {
            return points[0];
        }
        const midIndex = Math.floor(points.length / 2);
        return points[midIndex];
    }
    getEmptyFeatures() {
        return {
            nearestCoastlineDistanceM: null,
            nearCoastline: false,
            isCoastalArea: false,
            coastlineDensityScore: 0,
        };
    }
};
exports.GeoFactsCoastlineService = GeoFactsCoastlineService;
exports.GeoFactsCoastlineService = GeoFactsCoastlineService = GeoFactsCoastlineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GeoFactsCoastlineService);
//# sourceMappingURL=geo-facts-coastline.service.js.map