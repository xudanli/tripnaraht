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
var GeoFactsRiverService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFactsRiverService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let GeoFactsRiverService = GeoFactsRiverService_1 = class GeoFactsRiverService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GeoFactsRiverService_1.name);
    }
    async getRiverFeaturesForPoint(lat, lng, nearRiverThresholdM = 500, densityBufferKm = 2, nearWaterThresholdM = 200) {
        try {
            const nearestRiver = await this.getNearestRiverDistance(lat, lng);
            const densityScore = await this.getRiverDensityScore(lat, lng, densityBufferKm);
            const nearestWater = await this.getNearestWaterPolygonDistance(lat, lng);
            return {
                nearestRiverDistanceM: nearestRiver,
                nearRiver: nearestRiver !== null && nearestRiver <= nearRiverThresholdM,
                riverCrossingCount: 0,
                riverDensityScore: densityScore,
                nearWaterPolygon: nearestWater !== null && nearestWater <= nearWaterThresholdM,
                nearestWaterPolygonDistanceM: nearestWater,
            };
        }
        catch (error) {
            this.logger.error(`获取点位河网特征失败 (${lat}, ${lng}):`, error);
            return {
                nearestRiverDistanceM: null,
                nearRiver: false,
                riverCrossingCount: 0,
                riverDensityScore: 0,
                nearWaterPolygon: false,
                nearestWaterPolygonDistanceM: null,
            };
        }
    }
    async getRiverFeaturesForRoute(route, nearRiverThresholdM = 500, densityBufferKm = 2) {
        try {
            if (!route.points || route.points.length === 0) {
                return this.getEmptyFeatures();
            }
            const routeLine = this.buildRouteLine(route.points);
            const crossingCount = await this.getRiverCrossingCount(routeLine);
            const centerPoint = this.getRouteCenter(route.points);
            const densityScore = await this.getRiverDensityScore(centerPoint.lat, centerPoint.lng, densityBufferKm);
            const nearestRiver = await this.getNearestRiverDistance(centerPoint.lat, centerPoint.lng);
            const nearestWater = await this.getNearestWaterPolygonDistance(centerPoint.lat, centerPoint.lng);
            return {
                nearestRiverDistanceM: nearestRiver,
                nearRiver: nearestRiver !== null && nearestRiver <= nearRiverThresholdM,
                riverCrossingCount: crossingCount,
                riverDensityScore: densityScore,
                nearWaterPolygon: nearestWater !== null && nearestWater <= 200,
                nearestWaterPolygonDistanceM: nearestWater,
            };
        }
        catch (error) {
            this.logger.error('获取路线河网特征失败:', error);
            return this.getEmptyFeatures();
        }
    }
    async getNearestRiverDistance(lat, lng) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM geo_rivers_line
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
                this.logger.warn('geo_rivers_line 表不存在，请先导入河网数据');
                return null;
            }
            throw error;
        }
    }
    async getRiverCrossingCount(routeLine) {
        var _a;
        try {
            const result = await this.prisma.$queryRaw `
        SELECT COUNT(DISTINCT gid) as count
        FROM geo_rivers_line
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_GeomFromText(${routeLine}, 4326)
          );
      `;
            return Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                this.logger.warn('geo_rivers_line 表不存在，请先导入河网数据');
                return 0;
            }
            throw error;
        }
    }
    async getRiverDensityScore(lat, lng, bufferKm) {
        var _a, _b;
        try {
            const bufferMeters = bufferKm * 1000;
            const result = await this.prisma.$queryRaw `
        SELECT 
          COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m,
          COUNT(*) as segment_count
        FROM geo_rivers_line
        WHERE geom IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferMeters}
          );
      `;
            const totalLengthM = Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.total_length_m) || 0);
            const segmentCount = Number(((_b = result[0]) === null || _b === void 0 ? void 0 : _b.segment_count) || 0);
            const score = Math.min(totalLengthM / 10000, 1.0);
            return Math.round(score * 100) / 100;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                this.logger.warn('geo_rivers_line 表不存在，请先导入河网数据');
                return 0;
            }
            throw error;
        }
    }
    async getNearestWaterPolygonDistance(lat, lng) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM geo_water_poly
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
                this.logger.warn('geo_water_poly 表不存在，请先导入面状水系数据');
                return null;
            }
            throw error;
        }
    }
    buildRouteLine(points) {
        if (points.length < 2) {
            throw new Error('路线至少需要2个点');
        }
        const coords = points.map(p => `${p.lng} ${p.lat}`).join(', ');
        return `LINESTRING(${coords})`;
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
            nearestRiverDistanceM: null,
            nearRiver: false,
            riverCrossingCount: 0,
            riverDensityScore: 0,
            nearWaterPolygon: false,
            nearestWaterPolygonDistanceM: null,
        };
    }
};
exports.GeoFactsRiverService = GeoFactsRiverService;
exports.GeoFactsRiverService = GeoFactsRiverService = GeoFactsRiverService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GeoFactsRiverService);
//# sourceMappingURL=geo-facts-river.service.js.map