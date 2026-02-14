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
var RouteDirectionPoiGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionPoiGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const route_direction_cache_service_1 = require("./route-direction-cache.service");
const poi_layer_service_1 = require("../../poi/services/poi-layer.service");
const poi_route_affinity_service_1 = require("../../poi/services/poi-route-affinity.service");
let RouteDirectionPoiGeneratorService = RouteDirectionPoiGeneratorService_1 = class RouteDirectionPoiGeneratorService {
    constructor(prisma, cacheService, poiLayerService, poiAffinityService) {
        this.prisma = prisma;
        this.cacheService = cacheService;
        this.poiLayerService = poiLayerService;
        this.poiAffinityService = poiAffinityService;
        this.logger = new common_1.Logger(RouteDirectionPoiGeneratorService_1.name);
    }
    async generateCandidatePois(recommendation, regions, bufferMeters = 50000) {
        this.logger.log(`为路线方向生成候选 POI: ${recommendation.routeDirection.name}, buffer=${bufferMeters}m`);
        if (this.cacheService) {
            const cached = await this.cacheService.getCachedPoiPool(recommendation.routeDirection.id, bufferMeters, recommendation.signaturePois);
            if (cached) {
                this.logger.log(`使用缓存的 POI pool，大小: ${cached.length}`);
                return cached;
            }
        }
        const signaturePois = recommendation.signaturePois;
        if (!signaturePois) {
            this.logger.warn('路线方向没有 signaturePois，返回空列表');
            return [];
        }
        const poiTypes = signaturePois.types || [];
        const exampleUuids = signaturePois.examples || [];
        const corridorGeom = recommendation.routeDirection.corridorGeom;
        const candidates = [];
        if (exampleUuids.length > 0) {
            let usableUuids = exampleUuids;
            if (this.poiLayerService) {
                usableUuids = await this.poiLayerService.filterUsablePOIs(exampleUuids);
                this.logger.log(`POI分层过滤: ${exampleUuids.length} -> ${usableUuids.length} (只使用静态+半动态层)`);
            }
            const places = await this.prisma.place.findMany({
                where: {
                    uuid: { in: usableUuids },
                },
                include: {
                    City: {
                        select: {
                            countryCode: true,
                        },
                    },
                },
            });
            for (const place of places) {
                candidates.push(this.placeToActivityCandidate(place, 'core'));
            }
        }
        if (poiTypes.length > 0) {
            const typeConditions = poiTypes
                .map((type) => `metadata->>'canonicalType' = '${type.replace(/'/g, "''")}'`)
                .join(' OR ');
            const regionFilter = regions && regions.length > 0
                ? client_1.Prisma.sql `AND metadata->>'regionKey' = ANY(${regions})`
                : client_1.Prisma.sql ``;
            let corridorFilter = client_1.Prisma.sql ``;
            if (corridorGeom) {
                const isWktString = typeof corridorGeom === 'string' &&
                    (corridorGeom.startsWith('LINESTRING') ||
                        corridorGeom.startsWith('MULTILINESTRING') ||
                        corridorGeom.startsWith('POLYGON'));
                if (isWktString) {
                    corridorFilter = client_1.Prisma.sql `
          AND ST_DWithin(
            location::geography,
            ST_GeomFromText(${corridorGeom}, 4326)::geography,
            ${bufferMeters}
          )
        `;
                }
                else {
                    corridorFilter = client_1.Prisma.sql `
            AND ST_DWithin(
              location::geography,
              ${corridorGeom}::geography,
              ${bufferMeters}
            )
          `;
                }
            }
            const places = await this.prisma.$queryRaw `
        SELECT 
          p.*,
          c."countryCode" as "city_countryCode"
        FROM "Place" p
        LEFT JOIN "City" c ON p."cityId" = c.id
        WHERE 
          p.location IS NOT NULL
          AND (${client_1.Prisma.raw(typeConditions)})
          ${regionFilter}
          ${corridorFilter}
        LIMIT 50
      `;
            let usablePlaces = places;
            if (this.poiLayerService && places.length > 0) {
                const placeUuids = places.map(p => p.uuid);
                const usableUuids = await this.poiLayerService.filterUsablePOIs(placeUuids);
                usablePlaces = places.filter(p => usableUuids.includes(p.uuid));
                this.logger.log(`POI分层过滤: ${places.length} -> ${usablePlaces.length} (只使用静态+半动态层)`);
            }
            for (const place of usablePlaces) {
                if (!candidates.find(c => c.id === place.uuid)) {
                    candidates.push(this.placeToActivityCandidate(place, 'recommended'));
                }
            }
        }
        if (!regions || regions.length === 0) {
            const routeRegions = recommendation.routeDirection.regions || [];
            if (routeRegions.length > 0) {
                let corridorFilter = client_1.Prisma.sql ``;
                if (corridorGeom) {
                    const isWktString = typeof corridorGeom === 'string' &&
                        (corridorGeom.startsWith('LINESTRING') ||
                            corridorGeom.startsWith('MULTILINESTRING') ||
                            corridorGeom.startsWith('POLYGON'));
                    if (isWktString) {
                        corridorFilter = client_1.Prisma.sql `
            AND ST_DWithin(
              location::geography,
              ST_GeomFromText(${corridorGeom}, 4326)::geography,
              ${bufferMeters}
            )
          `;
                    }
                    else {
                        corridorFilter = client_1.Prisma.sql `
              AND ST_DWithin(
                location::geography,
                ${corridorGeom}::geography,
                ${bufferMeters}
              )
            `;
                    }
                }
                const places = await this.prisma.$queryRaw `
          SELECT 
            p.*,
            c."countryCode" as "city_countryCode"
          FROM "Place" p
          LEFT JOIN "City" c ON p."cityId" = c.id
          WHERE 
            p.location IS NOT NULL
            AND p.metadata->>'regionKey' = ANY(${routeRegions})
            ${corridorFilter}
          LIMIT 30
        `;
                for (const place of places) {
                    if (!candidates.find(c => c.id === place.uuid)) {
                        candidates.push(this.placeToActivityCandidate(place, 'optional'));
                    }
                }
            }
        }
        if (corridorGeom) {
            this.logger.log(`走廊空间约束生效，生成了 ${candidates.length} 个候选 POI（buffer=${bufferMeters}m）`);
        }
        this.logger.log(`生成了 ${candidates.length} 个候选 POI`);
        if (this.poiAffinityService && candidates.length > 0) {
            try {
                const candidateIds = candidates.map(c => c.id);
                const places = await this.prisma.place.findMany({
                    where: { uuid: { in: candidateIds } },
                    include: {
                        City: {
                            select: {
                                countryCode: true,
                            },
                        },
                    },
                });
                const placeMap = new Map(places.map(p => [p.uuid, p]));
                const poiInfos = candidates.map(candidate => {
                    var _a, _b, _c;
                    const place = placeMap.get(candidate.id);
                    const metadata = (place === null || place === void 0 ? void 0 : place.metadata) || {};
                    return {
                        id: candidate.id,
                        name: ((_a = candidate.name) === null || _a === void 0 ? void 0 : _a.zh) || ((_b = candidate.name) === null || _b === void 0 ? void 0 : _b.en),
                        tags: candidate.intentTags || [],
                        type: metadata.canonicalType,
                        category: place === null || place === void 0 ? void 0 : place.category,
                        location: ((_c = candidate.location) === null || _c === void 0 ? void 0 : _c.point)
                            ? {
                                lat: candidate.location.point.lat,
                                lng: candidate.location.point.lng,
                                regionKey: candidate.location.region,
                            }
                            : undefined,
                        metadata,
                    };
                });
                const affinities = await this.poiAffinityService.calculateAffinities(poiInfos, recommendation.routeDirection, {
                    considerLocation: true,
                    considerSeasonality: true,
                });
                const affinityMap = new Map(affinities.map(a => [a.poiId, a]));
                candidates.sort((a, b) => {
                    var _a, _b;
                    const affinityA = ((_a = affinityMap.get(a.id)) === null || _a === void 0 ? void 0 : _a.affinityScore) || 0;
                    const affinityB = ((_b = affinityMap.get(b.id)) === null || _b === void 0 ? void 0 : _b.affinityScore) || 0;
                    return affinityB - affinityA;
                });
                candidates.forEach(candidate => {
                    const affinity = affinityMap.get(candidate.id);
                    if (affinity) {
                        candidate.qualityScore = affinity.affinityScore / 100;
                        candidate.affinityInfo = {
                            score: affinity.affinityScore,
                            reasons: affinity.matchReasons,
                        };
                    }
                });
                this.logger.log(`POI路线亲和度计算完成，平均分数: ${affinities.reduce((sum, a) => sum + a.affinityScore, 0) / affinities.length}`);
            }
            catch (error) {
                this.logger.warn(`POI路线亲和度计算失败: ${error}，继续使用原始候选列表`);
            }
        }
        if (this.cacheService) {
            await this.cacheService.cachePoiPool(recommendation.routeDirection.id, bufferMeters, candidates, recommendation.signaturePois);
        }
        return candidates;
    }
    placeToActivityCandidate(place, priority = 'optional') {
        var _a;
        const metadata = place.metadata;
        const location = place.location
            ? this.extractLocation(place.location)
            : undefined;
        const countryCode = ((_a = place.City) === null || _a === void 0 ? void 0 : _a.countryCode) || place.city_countryCode || null;
        const activityType = this.inferActivityType(place.category, metadata);
        const durationMin = this.inferDuration(metadata, activityType);
        const riskLevel = this.inferRiskLevel(metadata);
        const weatherSensitivity = this.inferWeatherSensitivity(activityType, metadata);
        return {
            id: place.uuid,
            name: {
                zh: place.nameCN,
                en: place.nameEN || undefined,
            },
            type: activityType,
            location: location
                ? {
                    point: location,
                    address: place.address || undefined,
                    region: (metadata === null || metadata === void 0 ? void 0 : metadata.regionKey) || undefined,
                }
                : undefined,
            indoorOutdoor: this.inferIndoorOutdoor(activityType, metadata),
            durationMin,
            cost: place.rating
                ? {
                    amount: 0,
                    currency: 'USD',
                }
                : undefined,
            riskLevel,
            weatherSensitivity,
            intentTags: this.extractIntentTags(metadata, place.category),
            qualityScore: this.normalizeRating(place.rating, countryCode),
            mustSee: priority === 'core',
        };
    }
    normalizeRating(rating, countryCode) {
        if (!rating) {
            return 0.5;
        }
        const maxRating = this.getMaxRatingForCountry(countryCode);
        return Math.min(1.0, Math.max(0.0, rating / maxRating));
    }
    getMaxRatingForCountry(countryCode) {
        if (!countryCode) {
            return 5.0;
        }
        const code = countryCode.toUpperCase();
        if (code === 'CN' || code.startsWith('CN_')) {
            return 5.0;
        }
        return 5.0;
    }
    extractLocation(location) {
        if (typeof location === 'string') {
            const match = location.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
            if (match) {
                return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
            }
        }
        else if (location && typeof location === 'object') {
            if (location.lat && location.lng) {
                return { lat: location.lat, lng: location.lng };
            }
            if (location.coordinates && Array.isArray(location.coordinates)) {
                return { lng: location.coordinates[0], lat: location.coordinates[1] };
            }
        }
        return undefined;
    }
    inferActivityType(category, metadata) {
        var _a;
        const canonicalType = ((_a = metadata === null || metadata === void 0 ? void 0 : metadata.canonicalType) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        const categoryLower = category.toLowerCase();
        if (canonicalType.includes('waterfall') || canonicalType.includes('volcano')) {
            return 'nature';
        }
        if (canonicalType.includes('museum') || canonicalType.includes('temple')) {
            return 'museum';
        }
        if (categoryLower === 'restaurant') {
            return 'food';
        }
        if (categoryLower === 'shopping') {
            return 'shopping';
        }
        if (canonicalType.includes('hotel') || canonicalType.includes('lodge')) {
            return 'hotel';
        }
        return 'sightseeing';
    }
    inferDuration(metadata, activityType) {
        if (activityType === 'nature') {
            return 120;
        }
        if (activityType === 'museum') {
            return 90;
        }
        if (activityType === 'food') {
            return 60;
        }
        return 60;
    }
    inferRiskLevel(metadata) {
        const elevation = metadata === null || metadata === void 0 ? void 0 : metadata.elevationMeters;
        if (elevation && elevation > 4000) {
            return 'high';
        }
        if (elevation && elevation > 3000) {
            return 'medium';
        }
        return 'low';
    }
    inferWeatherSensitivity(activityType, metadata) {
        if (activityType === 'nature') {
            return 3;
        }
        if (activityType === 'museum') {
            return 0;
        }
        return 2;
    }
    inferIndoorOutdoor(activityType, metadata) {
        if (activityType === 'museum' || activityType === 'food') {
            return 'indoor';
        }
        if (activityType === 'nature') {
            return 'outdoor';
        }
        return 'mixed';
    }
    extractIntentTags(metadata, category) {
        var _a;
        const tags = [];
        if ((metadata === null || metadata === void 0 ? void 0 : metadata.tags) && Array.isArray(metadata.tags)) {
            tags.push(...metadata.tags);
        }
        const canonicalType = ((_a = metadata === null || metadata === void 0 ? void 0 : metadata.canonicalType) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        if (canonicalType.includes('photography') || canonicalType.includes('viewpoint')) {
            tags.push('摄影');
        }
        if (canonicalType.includes('hiking') || canonicalType.includes('trail')) {
            tags.push('徒步');
        }
        if (canonicalType.includes('ferry') || canonicalType.includes('cruise')) {
            tags.push('出海');
        }
        return tags;
    }
};
exports.RouteDirectionPoiGeneratorService = RouteDirectionPoiGeneratorService;
exports.RouteDirectionPoiGeneratorService = RouteDirectionPoiGeneratorService = RouteDirectionPoiGeneratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        route_direction_cache_service_1.RouteDirectionCacheService,
        poi_layer_service_1.POILayerService,
        poi_route_affinity_service_1.POIRouteAffinityService])
], RouteDirectionPoiGeneratorService);
//# sourceMappingURL=route-direction-poi-generator.service.js.map