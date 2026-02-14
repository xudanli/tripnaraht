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
var GeographicDataQualityMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeographicDataQualityMonitoringService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../prisma/prisma.service");
const data_quality_alert_service_1 = require("./data-quality-alert.service");
const dem_resolution_cache_service_1 = require("./dem-resolution-cache.service");
let GeographicDataQualityMonitoringService = GeographicDataQualityMonitoringService_1 = class GeographicDataQualityMonitoringService {
    constructor(prisma, alertService, resolutionCache) {
        this.prisma = prisma;
        this.alertService = alertService;
        this.resolutionCache = resolutionCache;
        this.logger = new common_1.Logger(GeographicDataQualityMonitoringService_1.name);
        this.testCoordinates = {
            CH: [
                { lat: 46.5197, lng: 6.6323, name: '日内瓦' },
                { lat: 47.3769, lng: 8.5417, name: '苏黎世' },
            ],
            NO: [
                { lat: 59.9139, lng: 10.7522, name: '奥斯陆' },
                { lat: 60.3913, lng: 5.3221, name: '卑尔根' },
            ],
            PE: [
                { lat: -12.0464, lng: -77.0428, name: '利马' },
                { lat: -13.1631, lng: -72.5450, name: '库斯科' },
            ],
            IS: [
                { lat: 64.1265, lng: -21.8174, name: '雷克雅未克' },
            ],
        };
    }
    async runGeographicMonitoringTask() {
        this.logger.log('开始执行地理数据质量监控任务...');
        try {
            await this.monitorDEMData();
            await this.monitorGeographicFeatures();
            this.logger.log('地理数据质量监控任务完成');
        }
        catch (error) {
            this.logger.error(`地理数据质量监控任务失败: ${error.message}`, error.stack);
        }
    }
    async monitorDEMData() {
        const countries = ['CH', 'NO', 'PE', 'IS'];
        for (const countryCode of countries) {
            try {
                const spatialAccuracy = await this.assessDEMSpatialAccuracy(countryCode);
                const coordinateSystemConsistency = await this.assessDEMCoordinateSystemConsistency(countryCode);
                const spatialCompleteness = await this.assessDEMSpatialCompleteness(countryCode);
                const queryPerformance = await this.monitorDEMQueryPerformance(countryCode);
                await this.upsertGeographicMonitor({
                    dataSource: `${countryCode.toLowerCase()}-dem`,
                    dataType: 'DEM',
                    countryCode,
                    spatialAccuracy,
                    coordinateSystemConsistency,
                    spatialCompleteness,
                    spatialConsistency: 1.0,
                    queryLatencyP50: queryPerformance.p50,
                    queryLatencyP95: queryPerformance.p95,
                    queryLatencyP99: queryPerformance.p99,
                    querySuccessRate: queryPerformance.successRate,
                    coverageRate: spatialCompleteness,
                });
                await this.checkGeographicAlertRules({
                    dataSource: `${countryCode.toLowerCase()}-dem`,
                    dataType: 'DEM',
                    countryCode,
                    coverageRate: spatialCompleteness,
                    queryLatencyP95: queryPerformance.p95,
                    querySuccessRate: queryPerformance.successRate,
                });
            }
            catch (error) {
                this.logger.error(`监控DEM数据失败 (${countryCode}): ${error.message}`);
            }
        }
    }
    async monitorGeographicFeatures() {
        const countries = ['CH', 'NO', 'PE', 'IS'];
        const featureTypes = ['RIVERS', 'MOUNTAINS', 'ROADS', 'COASTLINES', 'PORTS', 'RAILWAYS'];
        for (const countryCode of countries) {
            for (const featureType of featureTypes) {
                try {
                    const spatialCompleteness = await this.assessFeatureSpatialCompleteness(countryCode, featureType);
                    const coordinateSystemConsistency = await this.assessFeatureCoordinateSystemConsistency(countryCode, featureType);
                    const queryPerformance = await this.monitorFeatureQueryPerformance(countryCode, featureType);
                    await this.upsertGeographicMonitor({
                        dataSource: `${countryCode.toLowerCase()}-${featureType.toLowerCase()}`,
                        dataType: featureType,
                        countryCode,
                        spatialAccuracy: 1.0,
                        coordinateSystemConsistency,
                        spatialCompleteness,
                        spatialConsistency: 1.0,
                        queryLatencyP50: queryPerformance.p50,
                        queryLatencyP95: queryPerformance.p95,
                        queryLatencyP99: queryPerformance.p99,
                        querySuccessRate: queryPerformance.successRate,
                        coverageRate: spatialCompleteness,
                    });
                    await this.checkGeographicAlertRules({
                        dataSource: `${countryCode.toLowerCase()}-${featureType.toLowerCase()}`,
                        dataType: featureType,
                        countryCode,
                        coverageRate: spatialCompleteness,
                        queryLatencyP95: queryPerformance.p95,
                        querySuccessRate: queryPerformance.successRate,
                    });
                }
                catch (error) {
                    this.logger.error(`监控地理特征数据失败 (${countryCode}, ${featureType}): ${error.message}`);
                }
            }
        }
    }
    async assessDEMSpatialAccuracy(countryCode) {
        try {
            const resolution = await this.getDEMResolution();
            if (resolution === '30m')
                return 1.0;
            if (resolution === '90m')
                return 0.9;
            if (resolution === '300m')
                return 0.7;
            if (resolution === 'unknown')
                return 0.5;
            return 0.8;
        }
        catch (error) {
            return 0.5;
        }
    }
    async assessDEMCoordinateSystemConsistency(countryCode) {
        return 1.0;
    }
    async assessDEMSpatialCompleteness(countryCode) {
        const testCoords = this.testCoordinates[countryCode] || [];
        if (testCoords.length === 0)
            return 0;
        let successCount = 0;
        for (const coord of testCoords) {
            try {
                const elevation = await this.queryDEMElevation(coord.lat, coord.lng);
                if (elevation !== null) {
                    successCount++;
                }
            }
            catch (error) {
            }
        }
        return successCount / testCoords.length;
    }
    async monitorDEMQueryPerformance(countryCode) {
        const testCoords = this.testCoordinates[countryCode] || [];
        const latencies = [];
        let successCount = 0;
        for (let i = 0; i < Math.min(testCoords.length * 10, 50); i++) {
            const coord = testCoords[i % testCoords.length];
            const start = Date.now();
            try {
                const elevation = await this.queryDEMElevation(coord.lat, coord.lng);
                const latency = Date.now() - start;
                if (elevation !== null) {
                    successCount++;
                    latencies.push(latency);
                }
            }
            catch (error) {
            }
        }
        latencies.sort((a, b) => a - b);
        const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
        const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
        const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
        const successRate = testCoords.length > 0 ? successCount / (testCoords.length * 10) : 0;
        return { p50, p95, p99, successRate };
    }
    async assessFeatureSpatialCompleteness(countryCode, featureType) {
        var _a;
        const tableName = this.getFeatureTableName(featureType);
        if (!tableName)
            return 0;
        try {
            const bounds = this.getCountryBounds(countryCode);
            if (!bounds)
                return 0;
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
            return featureCount > 0 ? 1.0 : 0;
        }
        catch (error) {
            return 0;
        }
    }
    async assessFeatureCoordinateSystemConsistency(countryCode, featureType) {
        return 1.0;
    }
    async monitorFeatureQueryPerformance(countryCode, featureType) {
        var _a;
        const testCoords = this.testCoordinates[countryCode] || [];
        const latencies = [];
        let successCount = 0;
        const tableName = this.getFeatureTableName(featureType);
        if (!tableName) {
            return { p50: 0, p95: 0, p99: 0, successRate: 0 };
        }
        for (const coord of testCoords) {
            const start = Date.now();
            try {
                const result = await this.prisma.$queryRawUnsafe(`
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${coord.lng}, ${coord.lat}), 4326)::geography,
            5000
          );
        `);
                const latency = Date.now() - start;
                if (((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.count) !== undefined) {
                    successCount++;
                    latencies.push(latency);
                }
            }
            catch (error) {
            }
        }
        latencies.sort((a, b) => a - b);
        const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
        const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
        const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
        const successRate = testCoords.length > 0 ? successCount / testCoords.length : 0;
        return { p50, p95, p99, successRate };
    }
    async checkGeographicAlertRules(config) {
        const monitor = await this.prisma.geographicDataQualityMonitor.findUnique({
            where: {
                dataSource_dataType: {
                    dataSource: config.dataSource,
                    dataType: config.dataType,
                },
            },
        });
        if (!monitor)
            return;
        if (config.dataType === 'DEM' &&
            config.coverageRate < 0.8 &&
            ['CH', 'NO', 'PE'].includes(config.countryCode)) {
            await this.alertService.createAlert({
                geographicMonitorId: monitor.id,
                severity: 'CRITICAL',
                alertType: 'DEM_DATA_MISSING',
                message: `DEM数据缺失: ${config.countryCode}，覆盖率: ${(config.coverageRate * 100).toFixed(1)}%`,
                details: { countryCode: config.countryCode, coverageRate: config.coverageRate },
            });
        }
        if (config.queryLatencyP95 > 500) {
            await this.alertService.createAlert({
                geographicMonitorId: monitor.id,
                severity: 'HIGH',
                alertType: 'SPATIAL_QUERY_LATENCY_HIGH',
                message: `空间查询性能较差: P95延迟 ${config.queryLatencyP95}ms`,
                details: { queryLatencyP95: config.queryLatencyP95 },
            });
        }
        if (config.querySuccessRate < 0.95) {
            await this.alertService.createAlert({
                geographicMonitorId: monitor.id,
                severity: 'HIGH',
                alertType: 'SPATIAL_QUERY_FAILURE_RATE_HIGH',
                message: `空间查询失败率较高: ${((1 - config.querySuccessRate) * 100).toFixed(1)}%`,
                details: { querySuccessRate: config.querySuccessRate },
            });
        }
        if (config.dataType !== 'DEM' &&
            config.coverageRate < 0.9 &&
            ['CH', 'NO', 'PE'].includes(config.countryCode)) {
            await this.alertService.createAlert({
                geographicMonitorId: monitor.id,
                severity: 'MEDIUM',
                alertType: 'GEOGRAPHIC_FEATURES_COVERAGE_LOW',
                message: `地理特征数据覆盖率不足: ${config.dataType} - ${(config.coverageRate * 100).toFixed(1)}%`,
                details: { dataType: config.dataType, coverageRate: config.coverageRate },
            });
        }
    }
    async upsertGeographicMonitor(data) {
        const completeness = data.spatialCompleteness;
        const accuracy = data.spatialAccuracy;
        const consistency = data.spatialConsistency;
        const timeliness = 1.0;
        const traceability = 1.0;
        const overallScore = completeness * 0.3 +
            accuracy * 0.3 +
            consistency * 0.2 +
            timeliness * 0.15 +
            traceability * 0.05;
        let status = 'HEALTHY';
        if (overallScore < 0.6 || (data.coverageRate !== undefined && data.coverageRate < 0.8)) {
            status = 'CRITICAL';
        }
        else if (overallScore < 0.8 || (data.coverageRate !== undefined && data.coverageRate < 0.9)) {
            status = 'WARNING';
        }
        await this.prisma.geographicDataQualityMonitor.upsert({
            where: {
                dataSource_dataType: {
                    dataSource: data.dataSource,
                    dataType: data.dataType,
                },
            },
            create: {
                dataSource: data.dataSource,
                dataType: data.dataType,
                countryCode: data.countryCode,
                spatialAccuracy: data.spatialAccuracy,
                coordinateSystemConsistency: data.coordinateSystemConsistency,
                spatialCompleteness: data.spatialCompleteness,
                spatialConsistency: data.spatialConsistency,
                completeness,
                accuracy,
                consistency,
                timeliness,
                traceability,
                overallScore,
                queryLatencyP50: data.queryLatencyP50,
                queryLatencyP95: data.queryLatencyP95,
                queryLatencyP99: data.queryLatencyP99,
                querySuccessRate: data.querySuccessRate,
                coverageRate: data.coverageRate,
                lastUpdated: new Date(),
                lastVerified: new Date(),
                recordCount: 0,
                status,
            },
            update: {
                spatialAccuracy: data.spatialAccuracy,
                coordinateSystemConsistency: data.coordinateSystemConsistency,
                spatialCompleteness: data.spatialCompleteness,
                spatialConsistency: data.spatialConsistency,
                completeness,
                accuracy,
                consistency,
                timeliness,
                traceability,
                overallScore,
                queryLatencyP50: data.queryLatencyP50,
                queryLatencyP95: data.queryLatencyP95,
                queryLatencyP99: data.queryLatencyP99,
                querySuccessRate: data.querySuccessRate,
                coverageRate: data.coverageRate,
                lastUpdated: new Date(),
                lastVerified: new Date(),
                status,
            },
        });
    }
    async queryDEMElevation(lat, lng) {
        var _a, _b, _c, _d;
        try {
            const result = await this.prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_cities_merged
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);
            if (((_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.elevation) !== null && ((_b = result === null || result === void 0 ? void 0 : result[0]) === null || _b === void 0 ? void 0 : _b.elevation) !== undefined) {
                return parseFloat(result[0].elevation);
            }
            const globalResult = await this.prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_global
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);
            if (((_c = globalResult === null || globalResult === void 0 ? void 0 : globalResult[0]) === null || _c === void 0 ? void 0 : _c.elevation) !== null && ((_d = globalResult === null || globalResult === void 0 ? void 0 : globalResult[0]) === null || _d === void 0 ? void 0 : _d.elevation) !== undefined) {
                return parseFloat(globalResult[0].elevation);
            }
            return null;
        }
        catch (error) {
            return null;
        }
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
    getFeatureTableName(featureType) {
        const tableMap = {
            RIVERS: 'geo_rivers_line',
            MOUNTAINS: 'geo_mountains_standard',
            ROADS: 'geo_roads',
            COASTLINES: 'geo_coastlines',
            PORTS: 'geo_ports',
            RAILWAYS: 'geo_railways',
        };
        return tableMap[featureType] || null;
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
exports.GeographicDataQualityMonitoringService = GeographicDataQualityMonitoringService;
__decorate([
    (0, schedule_1.Cron)('*/30 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GeographicDataQualityMonitoringService.prototype, "runGeographicMonitoringTask", null);
exports.GeographicDataQualityMonitoringService = GeographicDataQualityMonitoringService = GeographicDataQualityMonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        data_quality_alert_service_1.DataQualityAlertService,
        dem_resolution_cache_service_1.DEMResolutionCacheService])
], GeographicDataQualityMonitoringService);
//# sourceMappingURL=geographic-data-quality-monitoring.service.js.map