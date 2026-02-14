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
var GeoFactsMountainService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFactsMountainService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let GeoFactsMountainService = GeoFactsMountainService_1 = class GeoFactsMountainService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GeoFactsMountainService_1.name);
    }
    async getMountainFeaturesForPoint(lat, lng, densityBufferKm = 5) {
        try {
            const inMountainResult = await this.checkInMountain(lat, lng);
            const elevationInfo = inMountainResult.inMountain
                ? await this.getMountainElevation(lat, lng)
                : { avg: null, max: null, min: null };
            const densityScore = await this.getMountainDensityScore(lat, lng, densityBufferKm);
            const complexity = await this.getTerrainComplexity(lat, lng, densityBufferKm);
            const nearestDistance = inMountainResult.inMountain
                ? 0
                : await this.getNearestMountainDistance(lat, lng);
            return {
                inMountain: inMountainResult.inMountain,
                mountainElevationAvg: elevationInfo.avg,
                mountainElevationMax: elevationInfo.max,
                mountainElevationMin: elevationInfo.min,
                mountainDensityScore: densityScore,
                terrainComplexity: complexity,
                nearestMountainDistanceM: nearestDistance,
            };
        }
        catch (error) {
            this.logger.error(`获取点位山脉特征失败 (${lat}, ${lng}):`, error);
            return {
                inMountain: false,
                mountainElevationAvg: null,
                mountainElevationMax: null,
                mountainElevationMin: null,
                mountainDensityScore: 0,
                terrainComplexity: 0,
                nearestMountainDistanceM: null,
            };
        }
    }
    async getMountainFeaturesForRoute(route, densityBufferKm = 5) {
        try {
            if (!route.points || route.points.length === 0) {
                return this.getEmptyFeatures();
            }
            const centerPoint = this.getRouteCenter(route.points);
            const routeLine = this.buildRouteLine(route.points);
            const intersectsMountain = await this.checkRouteIntersectsMountain(routeLine);
            const pointFeatures = await this.getMountainFeaturesForPoint(centerPoint.lat, centerPoint.lng, densityBufferKm);
            return {
                ...pointFeatures,
                inMountain: intersectsMountain || pointFeatures.inMountain,
            };
        }
        catch (error) {
            this.logger.error('获取路线山脉特征失败:', error);
            return this.getEmptyFeatures();
        }
    }
    async checkInMountain(lat, lng) {
        var _a;
        try {
            const result = await this.prisma.$queryRaw `
        SELECT COUNT(*) as count
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Contains(
            geom,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
          );
      `;
            return {
                inMountain: Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0) > 0,
            };
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                this.logger.warn('geo_mountains_standard 表不存在，请先导入山脉数据');
                return { inMountain: false };
            }
            throw error;
        }
    }
    async getMountainElevation(lat, lng) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          (properties->>'ELEV_AVG')::float as elevation_avg,
          (properties->>'ELEV_MAX')::float as elevation_max,
          (properties->>'ELEV_MIN')::float as elevation_min
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Contains(
            geom,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
          )
        LIMIT 1;
      `;
            if (result.length === 0) {
                return { avg: null, max: null, min: null };
            }
            return {
                avg: result[0].elevation_avg,
                max: result[0].elevation_max,
                min: result[0].elevation_min,
            };
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                return { avg: null, max: null, min: null };
            }
            return { avg: null, max: null, min: null };
        }
    }
    async getMountainDensityScore(lat, lng, bufferKm) {
        try {
            const bufferMeters = bufferKm * 1000;
            const result = await this.prisma.$queryRaw `
        SELECT 
          COALESCE(
            SUM(ST_Area(ST_Intersection(
              geom::geography,
              ST_Buffer(
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                ${bufferMeters}
              )
            ))),
            0
          ) as coverage_area,
          ST_Area(
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${bufferMeters}
            )
          ) as buffer_area
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${bufferMeters}
            )::geometry
          );
      `;
            if (result.length === 0 || !result[0].buffer_area) {
                return 0;
            }
            const coverageRatio = Number(result[0].coverage_area) / Number(result[0].buffer_area);
            return Math.min(Math.round(coverageRatio * 100) / 100, 1.0);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                return 0;
            }
            throw error;
        }
    }
    async getTerrainComplexity(lat, lng, bufferKm) {
        try {
            const bufferMeters = bufferKm * 1000;
            const result = await this.prisma.$queryRaw `
        SELECT 
          COUNT(*) as mountain_count,
          COALESCE(
            MAX((properties->>'ELEV_MAX')::float) - MIN((properties->>'ELEV_MIN')::float),
            0
          ) as elevation_range
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${bufferMeters}
            )::geometry
          );
      `;
            if (result.length === 0) {
                return 0;
            }
            const count = Number(result[0].mountain_count || 0);
            const elevationRange = Number(result[0].elevation_range || 0);
            const countScore = Math.min(count / 10 * 0.1, 0.5);
            const elevationScore = Math.min(elevationRange / 1000 * 0.1, 0.5);
            return Math.min(Math.round((countScore + elevationScore) * 100) / 100, 1.0);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                return 0;
            }
            throw error;
        }
    }
    async getNearestMountainDistance(lat, lng) {
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM geo_mountains_standard
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
                return null;
            }
            throw error;
        }
    }
    async checkRouteIntersectsMountain(routeLine) {
        var _a;
        try {
            const result = await this.prisma.$queryRaw `
        SELECT COUNT(*) as count
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_GeomFromText(${routeLine}, 4326)
          );
      `;
            return Number(((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0) > 0;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('does not exist')) {
                return false;
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
            inMountain: false,
            mountainElevationAvg: null,
            mountainElevationMax: null,
            mountainElevationMin: null,
            mountainDensityScore: 0,
            terrainComplexity: 0,
            nearestMountainDistanceM: null,
        };
    }
};
exports.GeoFactsMountainService = GeoFactsMountainService;
exports.GeoFactsMountainService = GeoFactsMountainService = GeoFactsMountainService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GeoFactsMountainService);
//# sourceMappingURL=geo-facts-mountain.service.js.map