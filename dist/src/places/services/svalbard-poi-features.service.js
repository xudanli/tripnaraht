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
var SvalbardPoiFeaturesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SvalbardPoiFeaturesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let SvalbardPoiFeaturesService = SvalbardPoiFeaturesService_1 = class SvalbardPoiFeaturesService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(SvalbardPoiFeaturesService_1.name);
    }
    async getSvalbardFeatures(region = 'SVALBARD_LONGYEARBYEN') {
        this.logger.log(`获取 ${region} 的 POI Features...`);
        const pickupPoints = await this.getPickupPoints(region);
        const trailAccessPoints = await this.getTrailAccessPoints(region);
        const safetyPoints = await this.getSafetyPoints(region);
        const supplyPoints = await this.getSupplyPoints(region);
        const transportPoints = await this.getTransportPoints(region);
        return {
            ports: {
                topPickupPoints: pickupPoints.slice(0, 3),
                hasHarbour: pickupPoints.length > 0,
                totalPorts: pickupPoints.length,
            },
            trail: {
                trailheads: trailAccessPoints,
                trailAccessPoints: trailAccessPoints,
                totalTrailheads: trailAccessPoints.length,
            },
            safety: {
                hospital: safetyPoints.hospital > 0,
                clinic: safetyPoints.clinic > 0,
                pharmacy: safetyPoints.pharmacy > 0,
                police: safetyPoints.police > 0,
                fireStation: safetyPoints.fireStation > 0,
                totalSafetyPoints: safetyPoints.total,
            },
            supply: {
                fuel: supplyPoints.fuel > 0,
                supermarket: supplyPoints.supermarket > 0,
                convenience: supplyPoints.convenience > 0,
                totalSupplyPoints: supplyPoints.total,
            },
            transport: {
                airport: transportPoints.airport > 0,
                parking: transportPoints.parking > 0,
                totalTransportPoints: transportPoints.total,
            },
        };
    }
    async getPickupPoints(region) {
        const places = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND (
          metadata->>'canonicalType' IN ('PORT_FERRY_TERMINAL', 'PORT_PIER', 'PORT_MARINA', 'PORT_DOCK')
          OR metadata->>'pickupScore' IS NOT NULL
        )
      ORDER BY 
        CAST(metadata->>'pickupScore' AS INTEGER) DESC NULLS LAST,
        id
    `;
        return places.map(p => {
            var _a, _b, _c, _d, _e;
            return ({
                placeId: p.id,
                name: p.nameCN,
                nameEN: p.nameEN || undefined,
                lat: p.lat,
                lng: p.lng,
                pickupScore: parseInt(((_a = p.metadata) === null || _a === void 0 ? void 0 : _a.pickupScore) || '0'),
                reasons: ((_c = (_b = p.metadata) === null || _b === void 0 ? void 0 : _b.pickupReasons) === null || _c === void 0 ? void 0 : _c.split('; ')) || [],
                distanceToCoastline: ((_d = p.metadata) === null || _d === void 0 ? void 0 : _d.distanceToCoastline)
                    ? parseFloat(p.metadata.distanceToCoastline)
                    : undefined,
                tags: ((_e = p.metadata) === null || _e === void 0 ? void 0 : _e.rawTags) || {},
            });
        });
    }
    async getTrailAccessPoints(region) {
        const places = await this.prisma.$queryRaw `
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND metadata->>'canonicalType' = 'TRAILHEAD'
    `;
        return places.map(p => {
            var _a, _b, _c, _d;
            return ({
                placeId: p.id,
                name: p.nameCN,
                nameEN: p.nameEN || undefined,
                lat: p.lat,
                lng: p.lng,
                confidence: (((_a = p.metadata) === null || _a === void 0 ? void 0 : _a.trailheadConfidence) || 'low'),
                parkingPlaceId: ((_b = p.metadata) === null || _b === void 0 ? void 0 : _b.associatedParking)
                    ? parseInt(p.metadata.associatedParking)
                    : undefined,
                distanceToParking: ((_c = p.metadata) === null || _c === void 0 ? void 0 : _c.distanceToParking)
                    ? parseFloat(p.metadata.distanceToParking)
                    : undefined,
                tags: ((_d = p.metadata) === null || _d === void 0 ? void 0 : _d.rawTags) || {},
            });
        });
    }
    async getSafetyPoints(region) {
        const counts = await this.prisma.$queryRaw `
      SELECT 
        metadata->>'canonicalType' as "canonicalType",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND metadata->>'canonicalType' IN ('HOSPITAL', 'CLINIC', 'PHARMACY', 'POLICE', 'FIRE_STATION')
      GROUP BY metadata->>'canonicalType'
    `;
        const result = {
            hospital: 0,
            clinic: 0,
            pharmacy: 0,
            police: 0,
            fireStation: 0,
            total: 0,
        };
        counts.forEach(c => {
            const count = Number(c.count);
            result.total += count;
            switch (c.canonicalType) {
                case 'HOSPITAL':
                    result.hospital = count;
                    break;
                case 'CLINIC':
                    result.clinic = count;
                    break;
                case 'PHARMACY':
                    result.pharmacy = count;
                    break;
                case 'POLICE':
                    result.police = count;
                    break;
                case 'FIRE_STATION':
                    result.fireStation = count;
                    break;
            }
        });
        return result;
    }
    async getSupplyPoints(region) {
        const counts = await this.prisma.$queryRaw `
      SELECT 
        metadata->>'canonicalType' as "canonicalType",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND metadata->>'canonicalType' IN ('FUEL_STATION', 'SUPERMARKET', 'CONVENIENCE_STORE')
      GROUP BY metadata->>'canonicalType'
    `;
        const result = {
            fuel: 0,
            supermarket: 0,
            convenience: 0,
            total: 0,
        };
        counts.forEach(c => {
            const count = Number(c.count);
            result.total += count;
            switch (c.canonicalType) {
                case 'FUEL_STATION':
                    result.fuel = count;
                    break;
                case 'SUPERMARKET':
                    result.supermarket = count;
                    break;
                case 'CONVENIENCE_STORE':
                    result.convenience = count;
                    break;
            }
        });
        return result;
    }
    async getTransportPoints(region) {
        const counts = await this.prisma.$queryRaw `
      SELECT 
        metadata->>'canonicalType' as "canonicalType",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND metadata->>'canonicalType' IN ('AIRPORT', 'PARKING')
      GROUP BY metadata->>'canonicalType'
    `;
        const result = {
            airport: 0,
            parking: 0,
            total: 0,
        };
        counts.forEach(c => {
            const count = Number(c.count);
            result.total += count;
            switch (c.canonicalType) {
                case 'AIRPORT':
                    result.airport = count;
                    break;
                case 'PARKING':
                    result.parking = count;
                    break;
            }
        });
        return result;
    }
};
exports.SvalbardPoiFeaturesService = SvalbardPoiFeaturesService;
exports.SvalbardPoiFeaturesService = SvalbardPoiFeaturesService = SvalbardPoiFeaturesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SvalbardPoiFeaturesService);
//# sourceMappingURL=svalbard-poi-features.service.js.map