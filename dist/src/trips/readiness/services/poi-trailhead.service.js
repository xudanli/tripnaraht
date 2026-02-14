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
var POITrailheadService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.POITrailheadService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let POITrailheadService = POITrailheadService_1 = class POITrailheadService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(POITrailheadService_1.name);
    }
    async findTrailAccessPoints(lat, lng, radiusKm = 25) {
        try {
            const radiusM = radiusKm * 1000;
            const primaryTrailheads = await this.findPrimaryTrailheads(lat, lng, radiusM);
            const secondaryTrailheads = await this.findSecondaryTrailheads(lat, lng, radiusM);
            const allTrailheads = [...primaryTrailheads, ...secondaryTrailheads];
            const uniqueTrailheads = this.deduplicateTrailheads(allTrailheads);
            const accessPoints = await Promise.all(uniqueTrailheads.map(trailhead => this.enrichTrailhead(trailhead)));
            return accessPoints;
        }
        catch (error) {
            this.logger.error(`查找徒步入口失败 (${lat}, ${lng}):`, error);
            return [];
        }
    }
    async findPrimaryTrailheads(lat, lng, radiusM) {
        const result = await this.prisma.$queryRawUnsafe(`
      SELECT 
        poi_id,
        name_default,
        lat,
        lng
      FROM poi_canonical
      WHERE geom IS NOT NULL
        AND category = 'TRAILHEAD'
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusM}
        );
    `);
        return result.map(row => ({
            poiId: row.poi_id,
            name: row.name_default || '未命名',
            lat: row.lat,
            lng: row.lng,
        }));
    }
    async findSecondaryTrailheads(lat, lng, radiusM) {
        const result = await this.prisma.$queryRawUnsafe(`
      SELECT DISTINCT
        p.poi_id,
        p.name_default,
        p.lat,
        p.lng
      FROM poi_canonical p
      WHERE p.geom IS NOT NULL
        AND p.category = 'INFORMATION'
        AND ST_DWithin(
          p.geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusM}
        )
        AND EXISTS (
          SELECT 1
          FROM geo_roads r
          WHERE r.geom IS NOT NULL
            AND ST_GeometryType(r.geom) IN ('ST_LineString', 'ST_MultiLineString')
            AND (
              r.properties->>'highway' IN ('path', 'footway', 'track', 'bridleway')
              OR r.properties->>'highway' LIKE '%path%'
            )
            AND ST_DWithin(
              r.geom::geography,
              p.geom::geography,
              50
            )
        );
    `);
        return result.map(row => ({
            poiId: row.poi_id,
            name: row.name_default || '未命名',
            lat: row.lat,
            lng: row.lng,
        }));
    }
    deduplicateTrailheads(trailheads) {
        const seen = new Set();
        const unique = [];
        for (const trailhead of trailheads) {
            if (!seen.has(trailhead.poiId)) {
                seen.add(trailhead.poiId);
                unique.push(trailhead);
            }
        }
        return unique;
    }
    async enrichTrailhead(trailhead) {
        const parking = await this.findNearestParking(trailhead.lat, trailhead.lng, 50);
        const information = await this.findNearestInformation(trailhead.lat, trailhead.lng, 100);
        const pathConnections = await this.countPathConnections(trailhead.lat, trailhead.lng, 50);
        return {
            trailheadId: trailhead.poiId,
            trailheadName: trailhead.name,
            trailheadLat: trailhead.lat,
            trailheadLng: trailhead.lng,
            parkingId: (parking === null || parking === void 0 ? void 0 : parking.poiId) || null,
            parkingName: (parking === null || parking === void 0 ? void 0 : parking.name) || null,
            parkingLat: (parking === null || parking === void 0 ? void 0 : parking.lat) || null,
            parkingLng: (parking === null || parking === void 0 ? void 0 : parking.lng) || null,
            parkingDistanceM: (parking === null || parking === void 0 ? void 0 : parking.distanceM) || null,
            informationPointId: (information === null || information === void 0 ? void 0 : information.poiId) || null,
            informationPointName: (information === null || information === void 0 ? void 0 : information.name) || null,
            pathConnections,
        };
    }
    async findNearestParking(lat, lng, maxDistanceM) {
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT 
          poi_id,
          name_default,
          lat,
          lng,
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND (
            tags_slim->>'amenity' = 'parking'
            OR tags_slim->>'parking' IS NOT NULL
          )
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${maxDistanceM}
          )
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `);
            if (result && result.length > 0) {
                return {
                    poiId: result[0].poi_id,
                    name: result[0].name_default || '未命名',
                    lat: result[0].lat,
                    lng: result[0].lng,
                    distanceM: Math.round(result[0].distance_m),
                };
            }
            return null;
        }
        catch (error) {
            this.logger.warn(`查找停车点失败:`, error);
            return null;
        }
    }
    async findNearestInformation(lat, lng, maxDistanceM) {
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT 
          poi_id,
          name_default
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'INFORMATION'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${maxDistanceM}
          )
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `);
            if (result && result.length > 0) {
                return {
                    poiId: result[0].poi_id,
                    name: result[0].name_default || '未命名',
                };
            }
            return null;
        }
        catch (error) {
            this.logger.warn(`查找信息点失败:`, error);
            return null;
        }
    }
    async countPathConnections(lat, lng, radiusM) {
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM geo_roads
        WHERE geom IS NOT NULL
          AND ST_GeometryType(geom) IN ('ST_LineString', 'ST_MultiLineString')
          AND (
            properties->>'highway' IN ('path', 'footway', 'track', 'bridleway')
            OR properties->>'highway' LIKE '%path%'
          )
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);
            return result && result.length > 0 ? Number(result[0].count) : 0;
        }
        catch (error) {
            this.logger.warn(`计算步道连接失败:`, error);
            return 0;
        }
    }
};
exports.POITrailheadService = POITrailheadService;
exports.POITrailheadService = POITrailheadService = POITrailheadService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], POITrailheadService);
//# sourceMappingURL=poi-trailhead.service.js.map