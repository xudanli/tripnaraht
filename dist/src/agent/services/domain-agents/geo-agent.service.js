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
var GeoAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoAgentService = void 0;
const common_1 = require("@nestjs/common");
const dem_elevation_service_1 = require("../../../trips/dem/services/dem-elevation.service");
const prisma_service_1 = require("../../../prisma/prisma.service");
const realtime_road_status_service_1 = require("../../../skills/world/services/realtime-road-status.service");
let GeoAgentService = GeoAgentService_1 = class GeoAgentService {
    constructor(prisma, demService, realtimeRoadStatusService) {
        this.prisma = prisma;
        this.demService = demService;
        this.realtimeRoadStatusService = realtimeRoadStatusService;
        this.logger = new common_1.Logger(GeoAgentService_1.name);
        this.logger.log('[GeoAgent] Initialized');
    }
    async analyzeTerrain(route) {
        const evidence = [];
        const elevationProfile = [];
        let cumulativeDistance = 0;
        const elevations = [];
        for (let i = 0; i < route.length; i++) {
            const point = route[i];
            let elevation = null;
            if (this.demService) {
                try {
                    elevation = await this.demService.getElevation(point.lat, point.lng);
                }
                catch {
                    this.logger.warn('[GeoAgent] Failed to get elevation');
                }
            }
            if (i > 0)
                cumulativeDistance += this.calculateDistance(route[i - 1], point);
            if (elevation !== null) {
                elevations.push(elevation);
                elevationProfile.push({ distance_km: Math.round(cumulativeDistance * 100) / 100, elevation_m: elevation });
            }
        }
        let totalAscent = 0, totalDescent = 0, maxSlope = 0;
        for (let i = 1; i < elevations.length; i++) {
            const diff = elevations[i] - elevations[i - 1];
            if (diff > 0)
                totalAscent += diff;
            else
                totalDescent += Math.abs(diff);
            const hDist = this.calculateDistance(route[i - 1], route[i]) * 1000;
            if (hDist > 0)
                maxSlope = Math.max(maxSlope, Math.atan(Math.abs(diff) / hDist) * (180 / Math.PI));
        }
        const maxElev = elevations.length > 0 ? Math.max(...elevations) : 0;
        const minElev = elevations.length > 0 ? Math.min(...elevations) : 0;
        evidence.push({
            evidence_id: `geo_terrain_${Date.now()}`,
            source: 'GeoAgent.analyzeTerrain',
            timestamp: new Date().toISOString(),
            data: { points_analyzed: route.length, elevations_retrieved: elevations.length },
        });
        const coverage = route.length > 0 ? elevations.length / route.length : 0;
        return {
            elevation_profile: elevationProfile,
            total_ascent_m: Math.round(totalAscent),
            total_descent_m: Math.round(totalDescent),
            max_elevation_m: Math.round(maxElev),
            min_elevation_m: Math.round(minElev),
            max_slope_deg: Math.round(maxSlope * 10) / 10,
            terrain_type: this.getTerrainType(totalAscent, maxElev, cumulativeDistance),
            difficulty: this.getDifficulty(totalAscent, maxSlope, cumulativeDistance),
            evidence,
            data_quality: this.createDataQuality({
                sourceType: this.demService ? 'REALTIME_API' : 'ESTIMATED',
                confidence: coverage > 0.8 ? 0.9 : coverage > 0.5 ? 0.7 : 0.5,
                coverage,
                fallbackInfo: !this.demService ? {
                    original_source: 'DEMElevationService',
                    fallback_reason: 'DEM service not available',
                    quality_impact: 'MODERATE',
                } : undefined,
            }),
        };
    }
    async checkRouteFeasibility(origin, destination, transportMode) {
        const evidence = [];
        const blockingFactors = [];
        const directDist = this.calculateDistance(origin, destination);
        const multiplier = transportMode === 'DRIVE' ? 1.3 : transportMode === 'WALK' ? 1.4 : transportMode === 'CYCLE' ? 1.35 : 1.5;
        const estDist = directDist * multiplier;
        const speed = transportMode === 'DRIVE' ? 60 : transportMode === 'WALK' ? 4 : transportMode === 'CYCLE' ? 15 : 30;
        const estDuration = (estDist / speed) * 60;
        const terrain = await this.analyzeTerrain([origin, destination]);
        let reachable = true;
        let confidence = 0.7;
        if (terrain.max_slope_deg > 30 && transportMode === 'DRIVE') {
            blockingFactors.push('Slope too steep');
            reachable = false;
        }
        if (terrain.total_ascent_m > 2000 && transportMode === 'WALK') {
            blockingFactors.push('Ascent too high');
            confidence -= 0.2;
        }
        if (estDist > 500 && transportMode === 'WALK') {
            blockingFactors.push('Distance too long');
            reachable = false;
        }
        if (this.demService && terrain.elevation_profile.length > 0)
            confidence += 0.2;
        if (transportMode === 'DRIVE' && this.realtimeRoadStatusService) {
            try {
            }
            catch (error) {
                this.logger.warn(`[GeoAgent] 获取实时道路状态失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        evidence.push({
            evidence_id: `geo_feasibility_${Date.now()}`,
            source: 'GeoAgent.checkRouteFeasibility',
            timestamp: new Date().toISOString(),
            data: { origin, destination, transport_mode: transportMode },
        });
        return {
            is_reachable: reachable,
            blocking_factors: blockingFactors.length > 0 ? blockingFactors : undefined,
            estimated_duration_min: Math.round(estDuration),
            estimated_distance_km: Math.round(estDist * 10) / 10,
            difficulty: terrain.difficulty,
            confidence: Math.min(1, Math.max(0, confidence)),
            evidence,
            data_quality: this.createDataQuality({
                sourceType: this.demService ? 'REALTIME_API' : 'ESTIMATED',
                confidence: confidence,
                coverage: terrain.data_quality.coverage,
            }),
        };
    }
    async findNearbyPOIs(center, radius_km, categories) {
        const evidence = [];
        const pois = [];
        try {
            const radiusM = radius_km * 1000;
            const catFilter = (categories === null || categories === void 0 ? void 0 : categories.length) ? 'AND category = ANY($4::text[])' : '';
            const query = `SELECT id::text as poi_id, name, category, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000 as distance_km FROM places WHERE ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3) ${catFilter} ORDER BY distance_km LIMIT 50`;
            const params = [center.lat, center.lng, radiusM];
            if (categories === null || categories === void 0 ? void 0 : categories.length)
                params.push(categories);
            const results = await this.prisma.$queryRawUnsafe(query, ...params);
            for (const r of results) {
                pois.push({ poi_id: r.poi_id, name: r.name, category: r.category, location: { lat: r.lat, lng: r.lng }, distance_km: Math.round(r.distance_km * 100) / 100 });
            }
            evidence.push({ evidence_id: `geo_poi_${Date.now()}`, source: 'GeoAgent.findNearbyPOIs', timestamp: new Date().toISOString(), data: { center, radius_km, results_count: pois.length } });
        }
        catch (e) {
            evidence.push({ evidence_id: `geo_poi_err_${Date.now()}`, source: 'GeoAgent.findNearbyPOIs', timestamp: new Date().toISOString(), data: { error: e === null || e === void 0 ? void 0 : e.message } });
        }
        return {
            pois,
            evidence,
            data_quality: this.createDataQuality({
                sourceType: pois.length > 0 ? 'CACHED' : 'ESTIMATED',
                confidence: pois.length > 0 ? 0.95 : 0.3,
                coverage: pois.length > 0 ? 1.0 : 0.0,
            }),
        };
    }
    calculateDistance(p1, p2) {
        const R = 6371;
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLng = (p2.lng - p1.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    getTerrainType(ascent, maxElev, dist) {
        const ascentPerKm = dist > 0 ? ascent / dist : 0;
        if (maxElev > 3000 || ascentPerKm > 100)
            return 'ALPINE';
        if (maxElev > 1500 || ascentPerKm > 50)
            return 'MOUNTAINOUS';
        if (ascentPerKm > 20)
            return 'HILLY';
        return 'FLAT';
    }
    getDifficulty(ascent, slope, dist) {
        const ascentPerKm = dist > 0 ? ascent / dist : 0;
        if (slope > 25 || ascentPerKm > 100 || ascent > 2000)
            return 'EXPERT';
        if (slope > 15 || ascentPerKm > 50 || ascent > 1000)
            return 'HARD';
        if (slope > 8 || ascentPerKm > 25 || ascent > 500)
            return 'MODERATE';
        return 'EASY';
    }
    createDataQuality(options) {
        const now = new Date().toISOString();
        return {
            source_type: options.sourceType,
            freshness_seconds: 0,
            confidence: options.confidence,
            coverage: options.coverage,
            retrieved_at: now,
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            fallback_info: options.fallbackInfo,
        };
    }
};
exports.GeoAgentService = GeoAgentService;
exports.GeoAgentService = GeoAgentService = GeoAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        dem_elevation_service_1.DEMElevationService,
        realtime_road_status_service_1.RealtimeRoadStatusService])
], GeoAgentService);
//# sourceMappingURL=geo-agent.service.js.map