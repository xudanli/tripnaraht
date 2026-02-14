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
var POIPickupScorerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.POIPickupScorerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let POIPickupScorerService = POIPickupScorerService_1 = class POIPickupScorerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(POIPickupScorerService_1.name);
    }
    async findTopPickupPoints(lat, lng, radiusKm = 25, limit = 5) {
        try {
            const radiusM = radiusKm * 1000;
            const candidates = await this.recallCandidates(lat, lng, radiusM);
            const candidatesWithCoastline = await Promise.all(candidates.map(async (candidate) => {
                const distance = await this.getDistanceToCoastline(candidate.lat, candidate.lng);
                return { ...candidate, distanceToCoastlineM: distance };
            }));
            const scored = candidatesWithCoastline.map(candidate => this.scoreCandidate(candidate));
            return scored
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
        }
        catch (error) {
            this.logger.error(`查找集合点失败 (${lat}, ${lng}):`, error);
            return [];
        }
    }
    async recallCandidates(lat, lng, radiusM) {
        const result = await this.prisma.$queryRawUnsafe(`
      SELECT 
        poi_id,
        name_default,
        lat,
        lng,
        category,
        tags_slim,
        opening_hours,
        phone,
        website
      FROM poi_canonical
      WHERE geom IS NOT NULL
        AND (
          category IN ('PORT', 'HARBOUR')
          OR tags_slim->>'amenity' = 'ferry_terminal'
          OR tags_slim->>'man_made' = 'pier'
          OR tags_slim->>'leisure' = 'marina'
          OR tags_slim->>'landuse' = 'harbour'
          OR tags_slim->>'water' = 'harbour'
          OR tags_slim->>'harbour' IS NOT NULL
          OR tags_slim->>'office' = 'tourism'
          OR tags_slim->>'tourism' = 'agency'
          OR tags_slim->>'amenity' = 'boat_rental'
        )
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusM}
        )
      ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography;
    `);
        return result.map((row) => ({
            poiId: row.poi_id,
            name: row.name_default || '未命名',
            lat: row.lat,
            lng: row.lng,
            category: row.category,
            tags: row.tags_slim || {},
            hasContactInfo: !!(row.opening_hours || row.phone || row.website),
        }));
    }
    async getDistanceToCoastline(lat, lng) {
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM geo_coastlines
        WHERE geom IS NOT NULL
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `);
            if (result && result.length > 0) {
                return Math.round(result[0].distance_m);
            }
            return null;
        }
        catch (error) {
            this.logger.warn(`查询海岸线距离失败:`, error);
            return null;
        }
    }
    scoreCandidate(candidate) {
        let score = 0;
        const reasons = [];
        if (candidate.tags['amenity'] === 'ferry_terminal') {
            score += 100;
            reasons.push('渡轮码头（强信号）');
        }
        if (candidate.tags['man_made'] === 'pier') {
            score += 60;
            reasons.push('栈桥/码头结构');
        }
        if (candidate.category === 'HARBOUR' ||
            candidate.tags['leisure'] === 'marina' ||
            candidate.tags['landuse'] === 'harbour' ||
            candidate.tags['water'] === 'harbour' ||
            candidate.tags['harbour']) {
            score += 40;
            reasons.push('港区/游艇码头');
        }
        if (candidate.tags['tourism'] === 'information') {
            score += 30;
            reasons.push('游客中心/信息点');
        }
        if (candidate.hasContactInfo) {
            score += 20;
            reasons.push('有联系方式/营业时间');
        }
        if (candidate.distanceToCoastlineM !== null && candidate.distanceToCoastlineM < 300) {
            score += 15;
            reasons.push(`距离海岸线 ${candidate.distanceToCoastlineM}m`);
        }
        else if (candidate.distanceToCoastlineM !== null && candidate.distanceToCoastlineM < 1000) {
            score += 5;
            reasons.push(`距离海岸线 ${candidate.distanceToCoastlineM}m`);
        }
        if (candidate.tags['office'] === 'tourism' ||
            candidate.tags['tourism'] === 'agency' ||
            candidate.tags['amenity'] === 'boat_rental') {
            score += 10;
            reasons.push('旅行社/运营商入口');
        }
        if (candidate.tags['cargo'] === 'yes' ||
            candidate.tags['industrial'] === 'yes' ||
            candidate.tags['landuse'] === 'industrial') {
            score -= 30;
            reasons.push('可能是货运/工业港区');
        }
        return {
            poiId: candidate.poiId,
            name: candidate.name,
            lat: candidate.lat,
            lng: candidate.lng,
            score,
            reasons,
            category: candidate.category,
            distanceToCoastlineM: candidate.distanceToCoastlineM,
            hasContactInfo: candidate.hasContactInfo,
            tags: candidate.tags,
        };
    }
};
exports.POIPickupScorerService = POIPickupScorerService;
exports.POIPickupScorerService = POIPickupScorerService = POIPickupScorerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], POIPickupScorerService);
//# sourceMappingURL=poi-pickup-scorer.service.js.map