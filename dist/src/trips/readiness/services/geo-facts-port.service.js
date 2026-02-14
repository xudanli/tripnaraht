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
var GeoFactsPortService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFactsPortService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let GeoFactsPortService = GeoFactsPortService_1 = class GeoFactsPortService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(GeoFactsPortService_1.name);
    }
    async getPortFeaturesForPoint(lat, lng, nearPortThresholdKm = 10, densityBufferKm = 50) {
        var _a, _b, _c;
        try {
            const nearestPort = await this.getNearestPort(lat, lng);
            const densityScore = await this.getPortDensityScore(lat, lng, densityBufferKm);
            const nearPortThresholdM = nearPortThresholdKm * 1000;
            return {
                nearestPortDistanceM: (_a = nearestPort === null || nearestPort === void 0 ? void 0 : nearestPort.distanceM) !== null && _a !== void 0 ? _a : null,
                nearPort: nearestPort !== null && nearestPort.distanceM <= nearPortThresholdM,
                portDensityScore: densityScore,
                nearestPortName: (_b = nearestPort === null || nearestPort === void 0 ? void 0 : nearestPort.name) !== null && _b !== void 0 ? _b : null,
                nearestPortProperties: (_c = nearestPort === null || nearestPort === void 0 ? void 0 : nearestPort.properties) !== null && _c !== void 0 ? _c : null,
            };
        }
        catch (error) {
            this.logger.error(`获取点位港口特征失败 (${lat}, ${lng}):`, error);
            return {
                nearestPortDistanceM: null,
                nearPort: false,
                portDensityScore: 0,
                nearestPortName: null,
                nearestPortProperties: null,
            };
        }
    }
    async getPortFeaturesForRoute(route, nearPortThresholdKm = 10, densityBufferKm = 50) {
        try {
            const centerLat = route.points.reduce((sum, p) => sum + p.lat, 0) / route.points.length;
            const centerLng = route.points.reduce((sum, p) => sum + p.lng, 0) / route.points.length;
            return await this.getPortFeaturesForPoint(centerLat, centerLng, nearPortThresholdKm, densityBufferKm);
        }
        catch (error) {
            this.logger.error(`获取路线港口特征失败:`, error);
            return {
                nearestPortDistanceM: null,
                nearPort: false,
                portDensityScore: 0,
                nearestPortName: null,
                nearestPortProperties: null,
            };
        }
    }
    async getNearestPort(lat, lng) {
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m,
          properties
        FROM geo_ports
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `);
            if (result && result.length > 0 && result[0]) {
                const properties = result[0].properties;
                return {
                    distanceM: Math.round(result[0].distance_m),
                    name: this.extractPortNameFromProperties(properties),
                    properties: properties,
                };
            }
            return null;
        }
        catch (error) {
            this.logger.error(`查询最近港口失败:`, error);
            return null;
        }
    }
    extractPortNameFromProperties(properties) {
        if (!properties || typeof properties !== 'object') {
            return null;
        }
        const nameFields = [
            '港口名称',
            'name',
            'NAME',
            'Name',
            'port_name',
            'PORT_NAME',
            'PortName',
            '名称',
            'UN_LOCODE',
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
    async getPortDensityScore(lat, lng, bufferKm) {
        try {
            const bufferM = bufferKm * 1000;
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM geo_ports
        WHERE ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${bufferM}
        );
      `);
            const count = result && result.length > 0 ? Number(result[0].count) : 0;
            const maxExpectedPorts = 10;
            return Math.min(count / maxExpectedPorts, 1.0);
        }
        catch (error) {
            this.logger.error(`计算港口密度失败:`, error);
            return 0;
        }
    }
};
exports.GeoFactsPortService = GeoFactsPortService;
exports.GeoFactsPortService = GeoFactsPortService = GeoFactsPortService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GeoFactsPortService);
//# sourceMappingURL=geo-facts-port.service.js.map