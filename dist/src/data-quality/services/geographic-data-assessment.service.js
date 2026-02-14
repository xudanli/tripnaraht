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
var GeographicDataAssessmentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeographicDataAssessmentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const dem_resolution_cache_service_1 = require("./dem-resolution-cache.service");
let GeographicDataAssessmentService = GeographicDataAssessmentService_1 = class GeographicDataAssessmentService {
    constructor(prisma, resolutionCache) {
        this.prisma = prisma;
        this.resolutionCache = resolutionCache;
        this.logger = new common_1.Logger(GeographicDataAssessmentService_1.name);
        this.testCoordinates = {
            CH: [
                { lat: 46.5197, lng: 6.6323, name: '日内瓦' },
                { lat: 47.3769, lng: 8.5417, name: '苏黎世' },
                { lat: 46.2044, lng: 6.1432, name: '洛桑' },
                { lat: 46.9481, lng: 7.4474, name: '伯尔尼' },
                { lat: 46.2276, lng: 6.1058, name: '蒙特勒' },
            ],
            NO: [
                { lat: 59.9139, lng: 10.7522, name: '奥斯陆' },
                { lat: 60.3913, lng: 5.3221, name: '卑尔根' },
                { lat: 63.4305, lng: 10.3951, name: '特隆赫姆' },
                { lat: 69.6492, lng: 18.9553, name: '特罗姆瑟' },
                { lat: 58.1467, lng: 7.9956, name: '克里斯蒂安桑' },
            ],
            PE: [
                { lat: -12.0464, lng: -77.0428, name: '利马' },
                { lat: -13.1631, lng: -72.5450, name: '库斯科' },
                { lat: -16.4090, lng: -71.5375, name: '阿雷基帕' },
                { lat: -8.1116, lng: -79.0288, name: '特鲁希略' },
                { lat: -3.7491, lng: -73.2532, name: '伊基托斯' },
            ],
        };
    }
    async assessCountryGeographicData(countryCode) {
        this.logger.log(`评估 ${countryCode} 的地理数据质量...`);
        const demAssessment = await this.assessDEMCoverage(countryCode);
        const geographicFeaturesAssessment = await this.assessGeographicFeaturesCoverage(countryCode);
        const recommendations = this.generateRecommendations(countryCode, demAssessment, geographicFeaturesAssessment);
        return {
            countryCode,
            demAssessment,
            geographicFeaturesAssessment,
            recommendations,
        };
    }
    async assessDEMCoverage(countryCode) {
        const citiesMergedExists = await this.checkDEMTableExists('geo_dem_cities_merged');
        const globalExists = await this.checkDEMTableExists('geo_dem_global');
        const hasDEMData = citiesMergedExists || globalExists;
        if (!hasDEMData) {
            return {
                coverageRate: 0,
                resolution: 'unknown',
                querySuccessRate: 0,
                queryLatency: { p50: 0, p95: 0, p99: 0 },
                missingRegions: [{
                        region: countryCode,
                        reason: 'DEM数据表不存在',
                    }],
            };
        }
        const resolution = await this.getDEMResolution();
        const testCoordinates = this.testCoordinates[countryCode] || [];
        let querySuccessCount = 0;
        const latencies = [];
        for (const coord of testCoordinates) {
            const { elevation, latency } = await this.queryDEMElevation(coord.lat, coord.lng);
            if (elevation !== null) {
                querySuccessCount++;
                latencies.push(latency);
            }
        }
        const querySuccessRate = testCoordinates.length > 0
            ? querySuccessCount / testCoordinates.length
            : 0;
        latencies.sort((a, b) => a - b);
        const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
        const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
        const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
        const coverageRate = querySuccessRate;
        const missingRegions = [];
        if (coverageRate < 0.9) {
            missingRegions.push({
                region: countryCode,
                reason: `DEM数据存在但覆盖率不足 (${(coverageRate * 100).toFixed(1)}%)`,
            });
        }
        return {
            coverageRate,
            resolution,
            querySuccessRate,
            queryLatency: { p50, p95, p99 },
            missingRegions,
        };
    }
    async assessGeographicFeaturesCoverage(countryCode) {
        const bounds = this.getCountryBounds(countryCode);
        if (!bounds) {
            throw new Error(`未知国家代码: ${countryCode}`);
        }
        const rivers = await this.assessFeatureCoverage('geo_rivers_line', countryCode, bounds);
        const mountains = await this.assessFeatureCoverage('geo_mountains_standard', countryCode, bounds);
        const roads = await this.assessFeatureCoverage('geo_roads', countryCode, bounds);
        const coastlines = await this.assessFeatureCoverage('geo_coastlines', countryCode, bounds);
        const ports = await this.assessFeatureCoverage('geo_ports', countryCode, bounds);
        const railways = await this.assessFeatureCoverage('geo_railways', countryCode, bounds);
        return {
            rivers,
            mountains,
            roads,
            coastlines,
            ports,
            railways,
        };
    }
    async assessFeatureCoverage(tableName, countryCode, bounds) {
        var _a, _b;
        try {
            const tableExists = await this.checkTableExists(tableName);
            if (!tableExists) {
                return {
                    coverageRate: 0,
                    featureCount: 0,
                    missingRegions: [countryCode],
                };
            }
            const countResult = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE ST_Intersects(
          geom,
          ST_MakeEnvelope(
            ${bounds.minLng}, ${bounds.minLat},
            ${bounds.maxLng}, ${bounds.maxLat},
            4326
          )
        );
      `);
            const featureCount = parseInt(((_a = countResult === null || countResult === void 0 ? void 0 : countResult[0]) === null || _a === void 0 ? void 0 : _a.count) || '0');
            const coverageRate = featureCount > 0 ? 1.0 : 0;
            return {
                coverageRate,
                featureCount,
                missingRegions: coverageRate < 0.9 ? [countryCode] : [],
            };
        }
        catch (error) {
            if ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('does not exist')) {
                return {
                    coverageRate: 0,
                    featureCount: 0,
                    missingRegions: [countryCode],
                };
            }
            this.logger.warn(`评估表 ${tableName} 失败: ${error.message}`);
            return {
                coverageRate: 0,
                featureCount: 0,
                missingRegions: [countryCode],
            };
        }
    }
    generateRecommendations(countryCode, demAssessment, geographicFeaturesAssessment) {
        const recommendations = [];
        if (demAssessment.coverageRate < 0.9) {
            recommendations.push({
                issue: 'DEM数据覆盖率不足',
                impact: 'HIGH',
                recommendation: `需要补充 ${countryCode} 的DEM数据，当前覆盖率: ${(demAssessment.coverageRate * 100).toFixed(1)}%`,
                priority: 'P0',
            });
        }
        if (demAssessment.queryLatency.p95 > 500) {
            recommendations.push({
                issue: 'DEM查询性能较差',
                impact: 'MEDIUM',
                recommendation: `P95查询延迟 ${demAssessment.queryLatency.p95}ms，超过目标500ms，建议优化PostGIS查询或增加缓存`,
                priority: 'P1',
            });
        }
        if (geographicFeaturesAssessment.roads.coverageRate < 0.9) {
            recommendations.push({
                issue: '道路数据覆盖率不足',
                impact: 'HIGH',
                recommendation: `需要补充 ${countryCode} 的道路数据，当前覆盖率: ${(geographicFeaturesAssessment.roads.coverageRate * 100).toFixed(1)}%`,
                priority: 'P0',
            });
        }
        if (geographicFeaturesAssessment.rivers.coverageRate < 0.9) {
            recommendations.push({
                issue: '河流数据覆盖率不足',
                impact: 'MEDIUM',
                recommendation: `需要补充 ${countryCode} 的河流数据，当前覆盖率: ${(geographicFeaturesAssessment.rivers.coverageRate * 100).toFixed(1)}%`,
                priority: 'P1',
            });
        }
        if (geographicFeaturesAssessment.mountains.coverageRate < 0.9) {
            recommendations.push({
                issue: '山脉数据覆盖率不足',
                impact: 'MEDIUM',
                recommendation: `需要补充 ${countryCode} 的山脉数据，当前覆盖率: ${(geographicFeaturesAssessment.mountains.coverageRate * 100).toFixed(1)}%`,
                priority: 'P1',
            });
        }
        return recommendations;
    }
    async generateQualityReport(countryCode) {
        return this.assessCountryGeographicData(countryCode);
    }
    async checkDEMTableExists(tableName) {
        var _a;
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        ) as exists;
      `);
            return ((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.exists) === true;
        }
        catch (error) {
            return false;
        }
    }
    async checkTableExists(tableName) {
        var _a;
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        ) as exists;
      `);
            return ((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.exists) === true;
        }
        catch (error) {
            return false;
        }
    }
    async queryDEMElevation(lat, lng) {
        var _a, _b, _c, _d, _e;
        const start = Date.now();
        let elevation = null;
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_cities_merged
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);
            if (((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.elevation) !== null && ((_b = result === null || result === void 0 ? void 0 : result[0]) === null || _b === void 0 ? void 0 : _b.elevation) !== undefined) {
                elevation = parseFloat(result[0].elevation);
            }
            else {
                const globalResult = await this.prisma.$queryRawUnsafe(`
          SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
          FROM geo_dem_global
          WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
          LIMIT 1;
        `);
                if (((_c = globalResult === null || globalResult === void 0 ? void 0 : globalResult[0]) === null || _c === void 0 ? void 0 : _c.elevation) !== null && ((_d = globalResult === null || globalResult === void 0 ? void 0 : globalResult[0]) === null || _d === void 0 ? void 0 : _d.elevation) !== undefined) {
                    elevation = parseFloat(globalResult[0].elevation);
                }
            }
        }
        catch (error) {
            if (!((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('does not exist'))) {
                this.logger.warn(`查询DEM失败 (${lat}, ${lng}): ${error.message}`);
            }
        }
        const latency = Date.now() - start;
        return { elevation, latency };
    }
    async getDEMResolution() {
        const citiesResolution = await this.resolutionCache.getResolution('geo_dem_cities_merged', async () => {
            var _a, _b;
            try {
                const result = await this.prisma.$queryRawUnsafe(`
            SELECT 
              ST_ScaleX(rast) as scalex,
              ST_ScaleY(rast) as scaley,
              ST_UpperLeftY(rast) as lat
            FROM geo_dem_cities_merged 
            LIMIT 1;
          `);
                if ((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.scalex) {
                    const resolution = this.calculateResolutionFromScale(Math.abs(result[0].scalex), Math.abs(result[0].scaley), result[0].lat);
                    if (resolution !== 'unknown') {
                        return resolution;
                    }
                }
            }
            catch (error) {
            }
            try {
                const result = await this.prisma.$queryRawUnsafe(`
            SELECT filename FROM geo_dem_cities_merged LIMIT 1;
          `);
                if ((_b = result === null || result === void 0 ? void 0 : result[0]) === null || _b === void 0 ? void 0 : _b.filename) {
                    const match = result[0].filename.match(/(\d+)m/i);
                    if (match) {
                        return `${match[1]}m`;
                    }
                }
            }
            catch (error) {
            }
            return 'unknown';
        });
        if (citiesResolution !== 'unknown') {
            return citiesResolution;
        }
        return await this.resolutionCache.getResolution('geo_dem_global', async () => {
            var _a;
            try {
                const result = await this.prisma.$queryRawUnsafe(`
            SELECT 
              ST_ScaleX(rast) as scalex,
              ST_ScaleY(rast) as scaley,
              ST_UpperLeftY(rast) as lat
            FROM geo_dem_global 
            LIMIT 1;
          `);
                if ((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.scalex) {
                    const resolution = this.calculateResolutionFromScale(Math.abs(result[0].scalex), Math.abs(result[0].scaley), result[0].lat);
                    if (resolution !== 'unknown') {
                        return resolution;
                    }
                }
            }
            catch (error) {
            }
            return 'unknown';
        });
    }
    calculateResolutionFromScale(scaleX, scaleY, lat) {
        const metersPerDegreeLat = 111000;
        const metersPerDegreeLng = lat
            ? 111000 * Math.cos((lat * Math.PI) / 180)
            : 111000;
        const resolutionMeters = Math.sqrt((scaleX * metersPerDegreeLng) ** 2 + (scaleY * metersPerDegreeLat) ** 2);
        const commonResolutions = [10, 30, 90, 300, 1000];
        let closestResolution = commonResolutions[0];
        let minDiff = Math.abs(resolutionMeters - closestResolution);
        for (const res of commonResolutions) {
            const diff = Math.abs(resolutionMeters - res);
            if (diff < minDiff) {
                minDiff = diff;
                closestResolution = res;
            }
        }
        if (minDiff / resolutionMeters > 0.5) {
            return `${Math.round(resolutionMeters)}m`;
        }
        return `${closestResolution}m`;
    }
    getCountryBounds(countryCode) {
        const bounds = {
            CH: { minLat: 45.8, maxLat: 47.8, minLng: 5.9, maxLng: 10.5 },
            NO: { minLat: 57.9, maxLat: 71.2, minLng: 4.5, maxLng: 31.3 },
            PE: { minLat: -18.3, maxLat: -0.0, minLng: -81.3, maxLng: -68.7 },
            IS: { minLat: 63.3, maxLat: 66.6, minLng: -24.5, maxLng: -13.5 },
        };
        return bounds[countryCode] || null;
    }
};
exports.GeographicDataAssessmentService = GeographicDataAssessmentService;
exports.GeographicDataAssessmentService = GeographicDataAssessmentService = GeographicDataAssessmentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        dem_resolution_cache_service_1.DEMResolutionCacheService])
], GeographicDataAssessmentService);
//# sourceMappingURL=geographic-data-assessment.service.js.map