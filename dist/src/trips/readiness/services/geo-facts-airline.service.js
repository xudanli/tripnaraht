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
var GeoFactsAirlineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFactsAirlineService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let GeoFactsAirlineService = GeoFactsAirlineService_1 = class GeoFactsAirlineService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GeoFactsAirlineService_1.name);
    }
    async getAirlineFeaturesForPoint(lat, lng, nearAirportThresholdKm = 20, densityBufferKm = 100) {
        var _a, _b, _c;
        try {
            const nearestAirport = await this.getNearestAirport(lat, lng);
            const densityScore = await this.getAirlineDensityScore(lat, lng, densityBufferKm);
            const nearAirportThresholdM = nearAirportThresholdKm * 1000;
            return {
                nearestAirportDistanceM: (_a = nearestAirport === null || nearestAirport === void 0 ? void 0 : nearestAirport.distanceM) !== null && _a !== void 0 ? _a : null,
                nearAirport: nearestAirport !== null && nearestAirport.distanceM <= nearAirportThresholdM,
                airlineDensityScore: densityScore,
                nearestAirportName: (_b = nearestAirport === null || nearestAirport === void 0 ? void 0 : nearestAirport.name) !== null && _b !== void 0 ? _b : null,
                nearestAirportProperties: (_c = nearestAirport === null || nearestAirport === void 0 ? void 0 : nearestAirport.properties) !== null && _c !== void 0 ? _c : null,
            };
        }
        catch (error) {
            this.logger.error(`获取点位航线特征失败 (${lat}, ${lng}):`, error);
            return {
                nearestAirportDistanceM: null,
                nearAirport: false,
                airlineDensityScore: 0,
                nearestAirportName: null,
                nearestAirportProperties: null,
            };
        }
    }
    async getAirlineFeaturesForRoute(route, nearAirportThresholdKm = 20, densityBufferKm = 100) {
        try {
            const centerLat = route.points.reduce((sum, p) => sum + p.lat, 0) / route.points.length;
            const centerLng = route.points.reduce((sum, p) => sum + p.lng, 0) / route.points.length;
            return await this.getAirlineFeaturesForPoint(centerLat, centerLng, nearAirportThresholdKm, densityBufferKm);
        }
        catch (error) {
            this.logger.error(`获取路线航线特征失败:`, error);
            return {
                nearestAirportDistanceM: null,
                nearAirport: false,
                airlineDensityScore: 0,
                nearestAirportName: null,
                nearestAirportProperties: null,
            };
        }
    }
    async getNearestAirport(lat, lng) {
        try {
            const pointResult = await this.prisma.$queryRawUnsafe(`
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m,
          properties,
          ST_GeometryType(geom) as geom_type
        FROM geo_airlines
        WHERE ST_GeometryType(geom) IN ('ST_Point', 'ST_MultiPoint')
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `);
            if (pointResult && pointResult.length > 0 && pointResult[0]) {
                const properties = pointResult[0].properties;
                return {
                    distanceM: Math.round(pointResult[0].distance_m),
                    name: this.extractAirportNameFromProperties(properties),
                    properties: properties,
                };
            }
            const lineResult = await this.prisma.$queryRawUnsafe(`
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m,
          properties
        FROM geo_airlines
        WHERE ST_GeometryType(geom) IN ('ST_LineString', 'ST_MultiLineString')
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `);
            if (lineResult && lineResult.length > 0 && lineResult[0]) {
                const properties = lineResult[0].properties;
                return {
                    distanceM: Math.round(lineResult[0].distance_m),
                    name: this.extractAirportNameFromProperties(properties),
                    properties: properties,
                };
            }
            return null;
        }
        catch (error) {
            this.logger.error(`查询最近机场失败:`, error);
            return null;
        }
    }
    extractAirportNameFromProperties(properties) {
        if (!properties || typeof properties !== 'object') {
            return null;
        }
        const nameFields = [
            '机场名称',
            'airport_name',
            'AIRPORT_NAME',
            'AirportName',
            'name',
            'NAME',
            'Name',
            '名称',
            'IATA',
            'ICAO',
        ];
        for (const field of nameFields) {
            if (properties[field]) {
                const value = String(properties[field]);
                if (value && value.trim() !== '') {
                    return value;
                }
            }
        }
        return null;
    }
    async getAirlineDensityScore(lat, lng, bufferKm) {
        try {
            const bufferM = bufferKm * 1000;
            const pointCountResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM geo_airlines
        WHERE ST_GeometryType(geom) IN ('ST_Point', 'ST_MultiPoint')
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferM}
          );
      `);
            const pointCount = pointCountResult && pointCountResult.length > 0 ? Number(pointCountResult[0].count) : 0;
            if (pointCount > 0) {
                const maxExpectedAirports = 5;
                return Math.min(pointCount / maxExpectedAirports, 1.0);
            }
            const lineLengthResult = await this.prisma.$queryRawUnsafe(`
        SELECT COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m
        FROM geo_airlines
        WHERE ST_GeometryType(geom) IN ('ST_LineString', 'ST_MultiLineString')
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferM}
          );
      `);
            const totalLengthM = lineLengthResult && lineLengthResult.length > 0 ? Number(lineLengthResult[0].total_length_m) : 0;
            const maxExpectedLength = 10000;
            return Math.min(totalLengthM / maxExpectedLength, 1.0);
        }
        catch (error) {
            this.logger.error(`计算航线密度失败:`, error);
            return 0;
        }
    }
};
exports.GeoFactsAirlineService = GeoFactsAirlineService;
exports.GeoFactsAirlineService = GeoFactsAirlineService = GeoFactsAirlineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GeoFactsAirlineService);
//# sourceMappingURL=geo-facts-airline.service.js.map