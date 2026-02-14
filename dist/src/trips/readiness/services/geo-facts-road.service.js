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
var GeoFactsRoadService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFactsRoadService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let GeoFactsRoadService = GeoFactsRoadService_1 = class GeoFactsRoadService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GeoFactsRoadService_1.name);
    }
    async getRoadFeaturesForPoint(lat, lng, nearRoadThresholdM = 500, densityBufferKm = 5) {
        try {
            const nearestRoad = await this.getNearestRoadDistance(lat, lng);
            const densityScore = await this.getRoadDensityScore(lat, lng, densityBufferKm);
            const accessibility = await this.getRoadAccessibility(lat, lng, densityBufferKm);
            const primaryRoadType = await this.getPrimaryRoadType(lat, lng);
            return {
                nearestRoadDistanceM: nearestRoad,
                nearRoad: nearestRoad !== null && nearestRoad <= nearRoadThresholdM,
                roadDensityScore: densityScore,
                roadAccessibility: accessibility,
                primaryRoadType,
            };
        }
        catch (error) {
            this.logger.error(`获取点位道路特征失败 (${lat}, ${lng}):`, error);
            return {
                nearestRoadDistanceM: null,
                nearRoad: false,
                roadDensityScore: 0,
                roadAccessibility: 0,
                primaryRoadType: null,
            };
        }
    }
    async getRoadFeaturesForRoute(route, nearRoadThresholdM = 500, densityBufferKm = 5) {
        try {
            if (!route.points || route.points.length === 0) {
                return this.getEmptyFeatures();
            }
            const centerPoint = this.getRouteCenter(route.points);
            return await this.getRoadFeaturesForPoint(centerPoint.lat, centerPoint.lng, nearRoadThresholdM, densityBufferKm);
        }
        catch (error) {
            this.logger.error('获取路线道路特征失败:', error);
            return this.getEmptyFeatures();
        }
    }
    async getNearestRoadDistance(lat, lng) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM geo_roads
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
                this.logger.warn('geo_roads 表不存在，请先导入道路数据');
                return null;
            }
            throw error;
        }
    }
    async getRoadDensityScore(lat, lng, bufferKm) {
        var _a;
        try {
            const bufferMeters = bufferKm * 1000;
            const result = await this.prisma.$queryRaw `
        SELECT 
          COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m
        FROM geo_roads
        WHERE geom IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferMeters}
          );
      `;
            const totalLengthM = Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.total_length_m) || 0);
            const score = Math.min(totalLengthM / 10000, 1.0);
            return Math.round(score * 100) / 100;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                return 0;
            }
            throw error;
        }
    }
    async getRoadAccessibility(lat, lng, bufferKm) {
        var _a, _b;
        try {
            const bufferMeters = bufferKm * 1000;
            const result = await this.prisma.$queryRaw `
        SELECT 
          COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m,
          COALESCE(SUM(
            CASE 
              WHEN properties->>'TYPE' = 'highway' 
                OR properties->>'TYPE' = 'motorway'
                OR properties->>'TYPE' = 'trunk'
              THEN ST_Length(geom::geography)
              ELSE 0
            END
          ), 0) as highway_length_m
        FROM geo_roads
        WHERE geom IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferMeters}
          );
      `;
            const totalLengthM = Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.total_length_m) || 0);
            const highwayLengthM = Number(((_b = result[0]) === null || _b === void 0 ? void 0 : _b.highway_length_m) || 0);
            if (totalLengthM === 0) {
                return 0;
            }
            const baseScore = Math.min(totalLengthM / 10000, 0.6);
            const highwayScore = Math.min(highwayLengthM * 2 / 10000, 0.4);
            return Math.min(Math.round((baseScore + highwayScore) * 100) / 100, 1.0);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                return 0;
            }
            return await this.getRoadDensityScore(lat, lng, bufferKm);
        }
    }
    async getPrimaryRoadType(lat, lng) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          properties->>'TYPE' as road_type
        FROM geo_roads
        WHERE geom IS NOT NULL
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `;
            if (result.length === 0) {
                return null;
            }
            return result[0].road_type || null;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                return null;
            }
            return null;
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
            nearestRoadDistanceM: null,
            nearRoad: false,
            roadDensityScore: 0,
            roadAccessibility: 0,
            primaryRoadType: null,
        };
    }
};
exports.GeoFactsRoadService = GeoFactsRoadService;
exports.GeoFactsRoadService = GeoFactsRoadService = GeoFactsRoadService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GeoFactsRoadService);
//# sourceMappingURL=geo-facts-road.service.js.map