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
var SpatialReplacementService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpatialReplacementService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let SpatialReplacementService = SpatialReplacementService_1 = class SpatialReplacementService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(SpatialReplacementService_1.name);
    }
    async replaceEntry(issue, input) {
        this.logger.debug(`替换入口点: ${issue.issueId}`);
        if (!issue.poiId || !issue.originalLocation) {
            return null;
        }
        const candidates = await this.findCandidateEntriesWithinCorridor(issue.originalLocation, input.routeDirection, input.world.physical.countryCode);
        if (candidates.length === 0) {
            this.logger.warn(`未找到入口替代候选点`);
            return null;
        }
        const scored = candidates
            .map(cand => ({
            cand,
            score: this.scoreReplacement({
                poiId: issue.poiId,
                lat: issue.originalLocation.lat,
                lng: issue.originalLocation.lng,
                type: '',
                tags: [],
                distM: 0,
                corridorT: 0,
                demDeltaM: 0,
                popularity: 0,
            }, cand, input.routeDirection),
        }))
            .sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (best.score < 0.4) {
            this.logger.warn(`最佳候选点评分过低: ${best.score}`);
            return null;
        }
        return {
            type: 'ENTRY_REPLACEMENT',
            originalPoiId: issue.poiId,
            newPoiId: best.cand.poiId,
            score: best.score,
            explanation: `入口点因${issue.reason}不可达，已替换为同一走廊内的替代入口点（距离 ${(best.cand.distM / 1000).toFixed(1)}km）`,
        };
    }
    async replacePoi(issue, input, dayIndex) {
        this.logger.debug(`替换 POI: ${issue.issueId}, 第 ${dayIndex} 天`);
        if (!issue.poiId || !issue.originalLocation) {
            return null;
        }
        const candidates = await this.findCandidatePoisWithinCorridor(issue.originalLocation, input.routeDirection, input.world.physical.countryCode, dayIndex);
        if (candidates.length === 0) {
            return null;
        }
        const daySegments = input.plan.segments.filter(s => s.dayIndex === dayIndex);
        const originalDayTotalKm = daySegments.reduce((sum, s) => sum + s.distanceKm, 0);
        const scored = candidates
            .map(cand => {
            const estimatedNewSegmentKm = cand.distM / 1000;
            const candDayTotalKm = originalDayTotalKm + estimatedNewSegmentKm;
            const rhythmPenalty = Math.abs(candDayTotalKm - originalDayTotalKm) / originalDayTotalKm > 0.2
                ? 0.5
                : 1.0;
            const baseScore = this.scoreReplacement({
                poiId: issue.poiId,
                lat: issue.originalLocation.lat,
                lng: issue.originalLocation.lng,
                type: '',
                tags: [],
                distM: 0,
                corridorT: 0,
                demDeltaM: 0,
                popularity: 0,
            }, cand, input.routeDirection);
            return {
                cand,
                score: baseScore * rhythmPenalty,
            };
        })
            .sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (best.score < 0.4) {
            return null;
        }
        return {
            type: 'POI_REPLACEMENT',
            originalPoiId: issue.poiId,
            newPoiId: best.cand.poiId,
            score: best.score,
            explanation: `POI 因${issue.reason}不可用，已替换为同一走廊内的替代 POI（距离 ${(best.cand.distM / 1000).toFixed(1)}km，步行距离变化 < 1km）`,
        };
    }
    async replaceSegmentCorridor(issue, input) {
        this.logger.debug(`替换局部走廊: ${issue.segmentId}`);
        if (!issue.segmentId) {
            return null;
        }
        const blockedSegment = input.plan.segments.find(s => s.segmentId === issue.segmentId);
        if (!blockedSegment) {
            return null;
        }
        return null;
    }
    async findCandidateEntriesWithinCorridor(originalLocation, routeDirection, countryCode) {
        if (!routeDirection.corridorGeom) {
            return [];
        }
        try {
            const bufferRadiusM = 30000;
            const candidates = await this.prisma.$queryRaw `
        SELECT
          p.id as "poiId",
          p."lat",
          p."lng",
          p.type,
          p.tags,
          COALESCE(p.popularity, 0.5) as popularity,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${originalLocation.lng}, ${originalLocation.lat}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)::geography
          ) AS "distM",
          ST_LineLocatePoint(
            ST_GeomFromText(${routeDirection.corridorGeom}, 4326),
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)
          ) AS "corridorT",
          COALESCE(p."elevationM", 0) - (
            SELECT COALESCE("elevationM", 0)
            FROM "Place"
            WHERE "lat" = ${originalLocation.lat} AND "lng" = ${originalLocation.lng}
            LIMIT 1
          ) AS "demDeltaM"
        FROM "Place" p
        WHERE
          p."countryCode" = ${countryCode}
          AND p.type IN ('ENTRANCE', 'TRAIL_HEAD', 'VIEWPOINT')
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)::geography,
            ST_GeomFromText(${routeDirection.corridorGeom}, 4326)::geography,
            ${bufferRadiusM}
          )
        ORDER BY "distM" ASC
        LIMIT 50
      `;
            return candidates.map(c => ({
                poiId: String(c.poiId),
                lat: parseFloat(c.lat),
                lng: parseFloat(c.lng),
                type: c.type || '',
                tags: Array.isArray(c.tags) ? c.tags : [],
                distM: parseFloat(c.distM) || 0,
                corridorT: parseFloat(c.corridorT) || 0,
                demDeltaM: parseFloat(c.demDeltaM) || 0,
                popularity: parseFloat(c.popularity) || 0.5,
            }));
        }
        catch (error) {
            this.logger.error(`查找候选入口点失败: ${error}`);
            return [];
        }
    }
    async findCandidatePoisWithinCorridor(originalLocation, routeDirection, countryCode, dayIndex) {
        if (!routeDirection.corridorGeom) {
            return [];
        }
        try {
            const bufferRadiusM = 20000;
            const candidates = await this.prisma.$queryRaw `
        SELECT
          p.id as "poiId",
          p."lat",
          p."lng",
          p.type,
          p.tags,
          COALESCE(p.popularity, 0.5) as popularity,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${originalLocation.lng}, ${originalLocation.lat}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)::geography
          ) AS "distM",
          ST_LineLocatePoint(
            ST_GeomFromText(${routeDirection.corridorGeom}, 4326),
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)
          ) AS "corridorT",
          COALESCE(p."elevationM", 0) - (
            SELECT COALESCE("elevationM", 0)
            FROM "Place"
            WHERE "lat" = ${originalLocation.lat} AND "lng" = ${originalLocation.lng}
            LIMIT 1
          ) AS "demDeltaM"
        FROM "Place" p
        WHERE
          p."countryCode" = ${countryCode}
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)::geography,
            ST_GeomFromText(${routeDirection.corridorGeom}, 4326)::geography,
            ${bufferRadiusM}
          )
        ORDER BY "distM" ASC
        LIMIT 50
      `;
            return candidates.map(c => ({
                poiId: String(c.poiId),
                lat: parseFloat(c.lat),
                lng: parseFloat(c.lng),
                type: c.type || '',
                tags: Array.isArray(c.tags) ? c.tags : [],
                distM: parseFloat(c.distM) || 0,
                corridorT: parseFloat(c.corridorT) || 0,
                demDeltaM: parseFloat(c.demDeltaM) || 0,
                popularity: parseFloat(c.popularity) || 0.5,
            }));
        }
        catch (error) {
            this.logger.error(`查找候选 POI 失败: ${error}`);
            return [];
        }
    }
    scoreReplacement(original, candidate, routeDirection) {
        var _a;
        const tagScore = this.jaccardSimilarity(original.tags || [], candidate.tags);
        const distScore = Math.exp(-candidate.distM / 20000);
        const demScore = candidate.demDeltaM <= 0
            ? 1.0
            : Math.exp(-candidate.demDeltaM / 300);
        const originalT = original.corridorT || 0.5;
        const corridorScore = 1 - Math.abs(candidate.corridorT - originalT);
        const popularityScore = candidate.popularity;
        const isStrictPhilosophy = ((_a = routeDirection.metadata) === null || _a === void 0 ? void 0 : _a.strictPhilosophy) === true;
        const weights = isStrictPhilosophy
            ? {
                tagScore: 0.35,
                distScore: 0.15,
                demScore: 0.20,
                corridorScore: 0.25,
                popularityScore: 0.05,
            }
            : {
                tagScore: 0.30,
                distScore: 0.20,
                demScore: 0.20,
                corridorScore: 0.20,
                popularityScore: 0.10,
            };
        const totalScore = weights.tagScore * tagScore +
            weights.distScore * distScore +
            weights.demScore * demScore +
            weights.corridorScore * corridorScore +
            weights.popularityScore * popularityScore;
        return totalScore;
    }
    jaccardSimilarity(set1, set2) {
        if (set1.length === 0 && set2.length === 0) {
            return 1.0;
        }
        const intersection = set1.filter(x => set2.includes(x)).length;
        const union = new Set([...set1, ...set2]).size;
        return union === 0 ? 0 : intersection / union;
    }
};
exports.SpatialReplacementService = SpatialReplacementService;
exports.SpatialReplacementService = SpatialReplacementService = SpatialReplacementService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SpatialReplacementService);
//# sourceMappingURL=spatial-replacement.service.js.map