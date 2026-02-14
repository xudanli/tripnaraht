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
var GeoFindCandidateWithinCorridorSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFindCandidateWithinCorridorSkill = void 0;
const common_1 = require("@nestjs/common");
const spatial_replacement_service_1 = require("../../trips/decision/services/spatial-replacement.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let GeoFindCandidateWithinCorridorSkill = GeoFindCandidateWithinCorridorSkill_1 = class GeoFindCandidateWithinCorridorSkill {
    constructor(spatialReplacement, prisma) {
        this.spatialReplacement = spatialReplacement;
        this.prisma = prisma;
        this.logger = new common_1.Logger(GeoFindCandidateWithinCorridorSkill_1.name);
        this.metadata = {
            name: 'geo.findCandidateWithinCorridor',
            description: '在走廊内查找候选点：Neptune 的空间候选召回工具化，在路线走廊内查找候选 POI/入口点',
            version: '1.0.0',
            category: 'rag',
            toolGroup: 'DOMAIN',
        };
        if (!this.spatialReplacement) {
            this.logger.warn('SpatialReplacementService 未注入，geo.findCandidateWithinCorridor 功能将受限');
        }
        if (!this.prisma) {
            this.logger.warn('PrismaService 未注入，geo.findCandidateWithinCorridor 无法执行原始查询');
        }
    }
    async execute(input) {
        const startTime = Date.now();
        this.logger.debug(`执行 geo.findCandidateWithinCorridor: countryCode=${input.countryCode}, bufferRadius=${input.bufferRadius}`);
        try {
            const MAX_BUFFER_RADIUS = 50000;
            const MAX_LIMIT = 100;
            const validatedBufferRadius = Math.min(input.bufferRadius || 20000, MAX_BUFFER_RADIUS);
            const validatedLimit = Math.min(input.limit || 50, MAX_LIMIT);
            if (!this.prisma) {
                throw new Error('PrismaService 未注入，无法执行查询');
            }
            const candidates = [];
            if (input.candidateType === 'POI' || input.candidateType === 'BOTH' || !input.candidateType) {
                const poiCandidates = await this.findPOIsWithinCorridor(input.originalLocation, input.corridorGeom, input.countryCode, validatedBufferRadius, input.poiCategory, validatedLimit);
                candidates.push(...poiCandidates);
            }
            if (input.candidateType === 'ENTRY' || input.candidateType === 'BOTH') {
                this.logger.debug('ENTRY 候选查询待实现（需要 routeDirection 对象）');
            }
            const uniqueCandidates = this.deduplicateCandidates(candidates);
            uniqueCandidates.sort((a, b) => a.distance - b.distance);
            const finalCandidates = uniqueCandidates.slice(0, validatedLimit);
            const queryTime = Date.now() - startTime;
            this.logger.debug(`geo.findCandidateWithinCorridor 查询完成: 找到 ${finalCandidates.length} 个候选，耗时 ${queryTime}ms`);
            return {
                candidates: finalCandidates,
                summary: {
                    totalFound: finalCandidates.length,
                    bufferRadius: validatedBufferRadius,
                    queryTime,
                },
            };
        }
        catch (error) {
            this.logger.error(`geo.findCandidateWithinCorridor 查询失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async findPOIsWithinCorridor(originalLocation, corridorGeom, countryCode, bufferRadius, poiCategory, limit = 50) {
        if (!this.prisma) {
            return [];
        }
        try {
            const isWktString = typeof corridorGeom === 'string' &&
                (corridorGeom.startsWith('LINESTRING') ||
                    corridorGeom.startsWith('MULTILINESTRING') ||
                    corridorGeom.startsWith('POLYGON'));
            const categoryFilter = poiCategory && poiCategory.length > 0
                ? client_1.Prisma.sql `AND category = ANY(ARRAY[${client_1.Prisma.raw(poiCategory.map((c) => `'${c}'`).join(', '))}]::"PlaceCategory"[])`
                : client_1.Prisma.sql ``;
            const candidates = await this.prisma.$queryRaw `
        SELECT
          p.id as "poiId",
          p."nameCN",
          p."nameEN",
          p.category,
          p.tags,
          p.metadata,
          COALESCE(p.popularity, 0.5) as popularity,
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng,
          COALESCE(p."elevationM", 0) as "elevationM",
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${originalLocation.lng}, ${originalLocation.lat}), 4326)::geography,
            p.location::geography
          ) AS "distM",
          ST_LineLocatePoint(
            ${isWktString ? client_1.Prisma.sql `ST_GeomFromText(${corridorGeom}, 4326)` : client_1.Prisma.sql `${corridorGeom}::geometry`},
            p.location::geometry
          ) AS "corridorT",
          COALESCE(p."elevationM", 0) - (
            SELECT COALESCE("elevationM", 0)
            FROM "Place"
            WHERE ST_Y(location::geometry) = ${originalLocation.lat} 
              AND ST_X(location::geometry) = ${originalLocation.lng}
            LIMIT 1
          ) AS "elevationDeltaM"
        FROM "Place" p
        WHERE
          p."countryCode" = ${countryCode}
          AND p.location IS NOT NULL
          AND ST_DWithin(
            p.location::geography,
            ${isWktString ? client_1.Prisma.sql `ST_GeomFromText(${corridorGeom}, 4326)::geography` : client_1.Prisma.sql `${corridorGeom}::geography`},
            ${bufferRadius}
          )
          ${categoryFilter}
        ORDER BY "distM" ASC
        LIMIT ${limit};
      `;
            return candidates.map((c) => ({
                poiId: String(c.poiId),
                location: { lat: c.lat, lng: c.lng },
                distance: Math.round(c.distM),
                corridorPosition: c.corridorT !== null ? Number(c.corridorT) : undefined,
                elevationDelta: c.elevationDeltaM !== null ? Number(c.elevationDeltaM) : undefined,
                category: c.category,
                tags: Array.isArray(c.tags) ? c.tags : [],
                popularity: Number(c.popularity),
                metadata: c.metadata,
            }));
        }
        catch (error) {
            this.logger.error(`查找 POI 候选失败: ${error.message}`, error.stack);
            return [];
        }
    }
    deduplicateCandidates(candidates) {
        const seen = new Set();
        const unique = [];
        for (const candidate of candidates) {
            const key = `${candidate.location.lat.toFixed(6)}_${candidate.location.lng.toFixed(6)}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(candidate);
            }
        }
        return unique;
    }
};
exports.GeoFindCandidateWithinCorridorSkill = GeoFindCandidateWithinCorridorSkill;
exports.GeoFindCandidateWithinCorridorSkill = GeoFindCandidateWithinCorridorSkill = GeoFindCandidateWithinCorridorSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [spatial_replacement_service_1.SpatialReplacementService,
        prisma_service_1.PrismaService])
], GeoFindCandidateWithinCorridorSkill);
//# sourceMappingURL=geo-find-candidate-within-corridor.skill.js.map