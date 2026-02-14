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
var POIRouteAffinityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.POIRouteAffinityService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let POIRouteAffinityService = POIRouteAffinityService_1 = class POIRouteAffinityService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(POIRouteAffinityService_1.name);
        this.DEFAULT_WEIGHTS = {
            tagMatch: 0.25,
            typeMatch: 0.30,
            locationMatch: 0.15,
            objectiveMatch: 0.15,
            exampleBonus: 0.10,
            seasonalityMatch: 0.05,
        };
    }
    async calculateAffinity(poi, routeDirection, options = {}) {
        var _a;
        const { currentMonth, considerLocation = true, considerSeasonality = true, customWeights = {}, } = options;
        const weights = { ...this.DEFAULT_WEIGHTS, ...customWeights };
        const tagMatch = this.calculateTagMatch(poi, routeDirection);
        const typeMatch = this.calculateTypeMatch(poi, routeDirection.signaturePois);
        const locationMatch = considerLocation
            ? await this.calculateLocationMatch(poi, routeDirection)
            : { score: 50, weight: 0, inRegion: false, inCorridor: false };
        const objectiveMatch = this.calculateObjectiveMatch(poi, (_a = routeDirection.constraints) === null || _a === void 0 ? void 0 : _a.objectives);
        const exampleBonus = this.calculateExampleBonus(poi, routeDirection.signaturePois);
        const seasonalityMatch = considerSeasonality
            ? this.calculateSeasonalityMatch(routeDirection.seasonality, currentMonth)
            : { score: 50, weight: 0, isBestMonth: false, isAvoidMonth: false };
        const breakdown = {
            tagMatch: { ...tagMatch, weight: weights.tagMatch },
            typeMatch: { ...typeMatch, weight: weights.typeMatch },
            locationMatch: { ...locationMatch, weight: weights.locationMatch },
            objectiveMatch: { ...objectiveMatch, weight: weights.objectiveMatch },
            exampleBonus: { ...exampleBonus, weight: weights.exampleBonus },
            seasonalityMatch: { ...seasonalityMatch, weight: weights.seasonalityMatch },
        };
        const totalScore = tagMatch.score * weights.tagMatch +
            typeMatch.score * weights.typeMatch +
            locationMatch.score * weights.locationMatch +
            objectiveMatch.score * weights.objectiveMatch +
            exampleBonus.score * weights.exampleBonus +
            seasonalityMatch.score * weights.seasonalityMatch;
        const matchReasons = this.generateMatchReasons(breakdown, poi, routeDirection);
        const mismatchReasons = this.generateMismatchReasons(breakdown, poi, routeDirection);
        return {
            poiId: poi.id,
            routeDirectionId: routeDirection.id,
            affinityScore: Math.round(totalScore * 100) / 100,
            scoreBreakdown: breakdown,
            matchReasons,
            mismatchReasons: mismatchReasons.length > 0 ? mismatchReasons : undefined,
        };
    }
    async calculateAffinities(pois, routeDirection, options = {}) {
        const affinities = await Promise.all(pois.map(poi => this.calculateAffinity(poi, routeDirection, options)));
        return affinities.sort((a, b) => b.affinityScore - a.affinityScore);
    }
    calculateTagMatch(poi, routeDirection) {
        const poiTags = poi.tags || [];
        const routeTags = routeDirection.tags || [];
        if (routeTags.length === 0) {
            return {
                score: 50,
                matchedTags: [],
                totalRouteTags: 0,
            };
        }
        const matchedTags = poiTags.filter(tag => routeTags.includes(tag));
        const matchRatio = matchedTags.length / routeTags.length;
        const score = Math.min(100, matchRatio * 100 + (matchedTags.length > 0 ? 20 : 0));
        return {
            score,
            matchedTags,
            totalRouteTags: routeTags.length,
        };
    }
    calculateTypeMatch(poi, signaturePois) {
        var _a;
        if (!signaturePois || !signaturePois.types || signaturePois.types.length === 0) {
            return {
                score: 50,
                isSignatureType: false,
            };
        }
        const poiType = poi.type || poi.category || '';
        const isSignatureType = signaturePois.types.includes(poiType);
        const typeWeight = ((_a = signaturePois.weights) === null || _a === void 0 ? void 0 : _a[poiType]) || 1.0;
        let score = 0;
        if (isSignatureType) {
            score = 80 + (typeWeight - 1) * 20;
            score = Math.min(100, score);
        }
        else {
            const partialMatch = signaturePois.types.some(type => poiType.toLowerCase().includes(type.toLowerCase()) ||
                type.toLowerCase().includes(poiType.toLowerCase()));
            score = partialMatch ? 40 : 10;
        }
        return {
            score,
            poiType,
            isSignatureType,
            typeWeight: isSignatureType ? typeWeight : undefined,
        };
    }
    async calculateLocationMatch(poi, routeDirection) {
        var _a;
        if (!poi.location) {
            return {
                score: 0,
                inRegion: false,
                inCorridor: false,
            };
        }
        const routeRegions = routeDirection.regions || [];
        const poiRegion = poi.location.regionKey;
        const inRegion = poiRegion ? routeRegions.includes(poiRegion) : false;
        let inCorridor = false;
        let distanceToCorridorKm;
        const corridorGeom = routeDirection.corridorGeom || ((_a = routeDirection.metadata) === null || _a === void 0 ? void 0 : _a.corridorGeom);
        if (corridorGeom) {
            try {
                const result = await this.prisma.$queryRaw `
          SELECT 
            ST_Distance(
              ST_SetSRID(ST_MakePoint(${poi.location.lng}, ${poi.location.lat}), 4326)::geography,
              ${client_1.Prisma.raw(typeof corridorGeom === 'string'
                    ? `ST_GeomFromText('${corridorGeom}', 4326)::geography`
                    : `${corridorGeom}::geography`)}
            ) / 1000.0 as distance_km,
            ST_DWithin(
              ST_SetSRID(ST_MakePoint(${poi.location.lng}, ${poi.location.lat}), 4326)::geography,
              ${client_1.Prisma.raw(typeof corridorGeom === 'string'
                    ? `ST_GeomFromText('${corridorGeom}', 4326)::geography`
                    : `${corridorGeom}::geography`)},
              50000
            ) as in_corridor
        `;
                if (result && result.length > 0) {
                    inCorridor = result[0].in_corridor;
                    distanceToCorridorKm = result[0].distance_km;
                }
            }
            catch (error) {
                this.logger.warn(`计算走廊距离失败: ${error}`);
            }
        }
        let score = 0;
        if (inCorridor) {
            score = 100;
        }
        else if (inRegion) {
            score = 70;
        }
        else if (distanceToCorridorKm !== undefined && distanceToCorridorKm < 100) {
            score = 50 - (distanceToCorridorKm / 100) * 30;
        }
        else {
            score = 10;
        }
        return {
            score: Math.max(0, Math.min(100, score)),
            inRegion,
            inCorridor,
            distanceToCorridorKm,
        };
    }
    calculateObjectiveMatch(poi, objectives) {
        if (!objectives) {
            return {
                score: 50,
                matchedObjectives: [],
            };
        }
        const poiTags = poi.tags || [];
        const matchedObjectives = [];
        let totalWeight = 0;
        let matchedWeight = 0;
        const objectiveMappings = {
            preferViewpoints: ['viewpoint', '观景点', '摄影', 'photography'],
            preferHotSpring: ['hot_spring', '温泉', 'spa'],
            preferPhotography: ['photography', '摄影', 'viewpoint', '观景点'],
            preferHiking: ['hiking', '徒步', 'trail', '步道'],
            preferCulture: ['museum', '博物馆', 'temple', '寺庙', 'culture', '文化'],
            preferNature: ['nature', '自然', 'waterfall', '瀑布', 'volcano', '火山'],
        };
        for (const [objectiveKey, objectiveWeight] of Object.entries(objectives)) {
            if (typeof objectiveWeight === 'number' && objectiveWeight > 0) {
                totalWeight += objectiveWeight;
                const relatedTags = objectiveMappings[objectiveKey] || [];
                const hasMatch = relatedTags.some(tag => poiTags.some(poiTag => poiTag.toLowerCase().includes(tag.toLowerCase())));
                if (hasMatch) {
                    matchedObjectives.push(objectiveKey);
                    matchedWeight += objectiveWeight;
                }
            }
        }
        const score = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 50;
        return {
            score,
            matchedObjectives,
            objectiveWeights: objectives,
        };
    }
    calculateExampleBonus(poi, signaturePois) {
        if (!signaturePois || !signaturePois.examples || signaturePois.examples.length === 0) {
            return {
                score: 0,
                isExample: false,
            };
        }
        const isExample = signaturePois.examples.includes(poi.id);
        return {
            score: isExample ? 100 : 0,
            isExample,
        };
    }
    calculateSeasonalityMatch(seasonality, currentMonth) {
        if (!seasonality || !currentMonth) {
            return {
                score: 50,
                isBestMonth: false,
                isAvoidMonth: false,
            };
        }
        const bestMonths = seasonality.bestMonths || [];
        const avoidMonths = seasonality.avoidMonths || [];
        const isBestMonth = bestMonths.includes(currentMonth);
        const isAvoidMonth = avoidMonths.includes(currentMonth);
        let score = 50;
        if (isBestMonth) {
            score = 100;
        }
        else if (isAvoidMonth) {
            score = 0;
        }
        else if (bestMonths.length > 0) {
            const distances = bestMonths.map(month => {
                const dist = Math.abs(month - currentMonth);
                return Math.min(dist, 12 - dist);
            });
            const minDistance = Math.min(...distances);
            score = 50 + (5 - minDistance) * 10;
            score = Math.max(30, Math.min(90, score));
        }
        return {
            score,
            currentMonth,
            isBestMonth,
            isAvoidMonth,
        };
    }
    generateMatchReasons(breakdown, poi, routeDirection) {
        var _a;
        const reasons = [];
        if (breakdown.tagMatch.matchedTags.length > 0) {
            reasons.push(`标签匹配：${breakdown.tagMatch.matchedTags.join('、')}`);
        }
        if (breakdown.typeMatch.isSignatureType) {
            reasons.push(`类型匹配：${breakdown.typeMatch.poiType}（路线代表性类型）`);
        }
        if (breakdown.locationMatch.inCorridor) {
            reasons.push('位于路线走廊内');
        }
        else if (breakdown.locationMatch.inRegion) {
            reasons.push(`位于路线区域：${(_a = poi.location) === null || _a === void 0 ? void 0 : _a.regionKey}`);
        }
        if (breakdown.objectiveMatch.matchedObjectives.length > 0) {
            reasons.push(`符合路线偏好：${breakdown.objectiveMatch.matchedObjectives.join('、')}`);
        }
        if (breakdown.exampleBonus.isExample) {
            reasons.push('路线推荐示例POI');
        }
        if (breakdown.seasonalityMatch.isBestMonth) {
            reasons.push(`当前月份（${breakdown.seasonalityMatch.currentMonth}月）为最佳旅行时间`);
        }
        return reasons;
    }
    generateMismatchReasons(breakdown, poi, routeDirection) {
        const reasons = [];
        if (breakdown.tagMatch.score < 30) {
            reasons.push('标签匹配度低');
        }
        if (!breakdown.typeMatch.isSignatureType && breakdown.typeMatch.score < 30) {
            reasons.push('类型不匹配路线特征');
        }
        if (!breakdown.locationMatch.inRegion && !breakdown.locationMatch.inCorridor) {
            reasons.push('不在路线覆盖区域内');
        }
        if (breakdown.seasonalityMatch.isAvoidMonth) {
            reasons.push(`当前月份（${breakdown.seasonalityMatch.currentMonth}月）为路线禁忌时间`);
        }
        return reasons;
    }
};
exports.POIRouteAffinityService = POIRouteAffinityService;
exports.POIRouteAffinityService = POIRouteAffinityService = POIRouteAffinityService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], POIRouteAffinityService);
//# sourceMappingURL=poi-route-affinity.service.js.map