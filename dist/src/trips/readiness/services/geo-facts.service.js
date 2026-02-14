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
var GeoFactsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFactsService = void 0;
const common_1 = require("@nestjs/common");
const geo_facts_river_service_1 = require("./geo-facts-river.service");
const geo_facts_mountain_service_1 = require("./geo-facts-mountain.service");
const geo_facts_road_service_1 = require("./geo-facts-road.service");
const geo_facts_coastline_service_1 = require("./geo-facts-coastline.service");
const geo_facts_port_service_1 = require("./geo-facts-port.service");
const geo_facts_airline_service_1 = require("./geo-facts-airline.service");
const geo_facts_poi_service_1 = require("./geo-facts-poi.service");
const geo_facts_cache_service_1 = require("./geo-facts-cache.service");
const physical_reality_retrieval_service_1 = require("./physical-reality-retrieval.service");
let GeoFactsService = GeoFactsService_1 = class GeoFactsService {
    constructor(riverService, mountainService, roadService, coastlineService, portService, airlineService, poiService, cacheService, physicalRealityService) {
        this.riverService = riverService;
        this.mountainService = mountainService;
        this.roadService = roadService;
        this.coastlineService = coastlineService;
        this.portService = portService;
        this.airlineService = airlineService;
        this.poiService = poiService;
        this.cacheService = cacheService;
        this.physicalRealityService = physicalRealityService;
        this.logger = new common_1.Logger(GeoFactsService_1.name);
    }
    async getGeoFeaturesForPoint(lat, lng, options) {
        if ((options === null || options === void 0 ? void 0 : options.useCache) !== false && this.cacheService) {
            const cached = await this.cacheService.get(lat, lng, options);
            if (cached) {
                this.logger.debug(`Cache hit for point (${lat}, ${lng})`);
                return cached;
            }
        }
        this.logger.debug(`Fetching geo features for point (${lat}, ${lng})`);
        const region = this.identifyRegion(lat, lng);
        const [rivers, mountains, roads, coastlines, ports, airlines, pois, physicalReality] = await Promise.all([
            this.riverService.getRiverFeaturesForPoint(lat, lng, options === null || options === void 0 ? void 0 : options.nearRiverThresholdM, options === null || options === void 0 ? void 0 : options.densityBufferKm, options === null || options === void 0 ? void 0 : options.nearWaterThresholdM),
            this.mountainService.getMountainFeaturesForPoint(lat, lng, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.roadService.getRoadFeaturesForPoint(lat, lng, options === null || options === void 0 ? void 0 : options.nearRoadThresholdM, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.coastlineService.getCoastlineFeaturesForPoint(lat, lng, options === null || options === void 0 ? void 0 : options.nearCoastlineThresholdKm, options === null || options === void 0 ? void 0 : options.coastalAreaThresholdKm, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.portService.getPortFeaturesForPoint(lat, lng, options === null || options === void 0 ? void 0 : options.nearPortThresholdKm, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.airlineService.getAirlineFeaturesForPoint(lat, lng, options === null || options === void 0 ? void 0 : options.nearAirportThresholdKm, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.poiService.getPOIFeaturesForPoint(lat, lng, options === null || options === void 0 ? void 0 : options.poiRadiusKm, options === null || options === void 0 ? void 0 : options.pickupLimit),
            this.physicalRealityService
                ? this.physicalRealityService.retrievePhysicalRealityData(region, {
                    lat,
                    lng,
                    month: options === null || options === void 0 ? void 0 : options.month,
                    limit: 10,
                }).catch((error) => {
                    this.logger.warn(`Failed to retrieve Physical Reality data: ${error instanceof Error ? error.message : String(error)}`);
                    return undefined;
                })
                : Promise.resolve(undefined),
        ]);
        const result = {
            rivers,
            mountains,
            roads,
            coastlines,
            ports,
            airlines,
            pois,
            physicalReality,
            terrainComplexity: this.calculateTerrainComplexity(rivers, mountains),
            riskScore: this.calculateRiskScore(rivers, mountains, roads, coastlines, physicalReality, options === null || options === void 0 ? void 0 : options.month),
            accessibilityScore: this.calculateAccessibilityScore(roads, ports, airlines, physicalReality, options === null || options === void 0 ? void 0 : options.month),
        };
        if ((options === null || options === void 0 ? void 0 : options.useCache) !== false && this.cacheService) {
            await this.cacheService.set(lat, lng, result, options);
        }
        return result;
    }
    async getGeoFeaturesForRoute(route, options) {
        const [rivers, mountains, roads, coastlines, ports, airlines, pois] = await Promise.all([
            this.riverService.getRiverFeaturesForRoute(route, options === null || options === void 0 ? void 0 : options.nearRiverThresholdM, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.mountainService.getMountainFeaturesForRoute(route, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.roadService.getRoadFeaturesForRoute(route, options === null || options === void 0 ? void 0 : options.nearRoadThresholdM, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.coastlineService.getCoastlineFeaturesForRoute(route, options === null || options === void 0 ? void 0 : options.nearCoastlineThresholdKm, options === null || options === void 0 ? void 0 : options.coastalAreaThresholdKm, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.portService.getPortFeaturesForRoute(route, options === null || options === void 0 ? void 0 : options.nearPortThresholdKm, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.airlineService.getAirlineFeaturesForRoute(route, options === null || options === void 0 ? void 0 : options.nearAirportThresholdKm, options === null || options === void 0 ? void 0 : options.densityBufferKm),
            this.poiService.getPOIFeaturesForRoute(route, options === null || options === void 0 ? void 0 : options.poiRadiusKm, options === null || options === void 0 ? void 0 : options.pickupLimit),
        ]);
        return {
            rivers,
            mountains,
            roads,
            coastlines,
            ports,
            airlines,
            pois,
            terrainComplexity: this.calculateTerrainComplexity(rivers, mountains),
            riskScore: this.calculateRiskScore(rivers, mountains, roads, coastlines, undefined, undefined),
            accessibilityScore: this.calculateAccessibilityScore(roads, ports, airlines, undefined, undefined),
        };
    }
    calculateTerrainComplexity(rivers, mountains) {
        const riverWeight = 0.3;
        const mountainComplexityWeight = 0.4;
        const mountainDensityWeight = 0.3;
        const score = rivers.riverDensityScore * riverWeight +
            mountains.terrainComplexity * mountainComplexityWeight +
            mountains.mountainDensityScore * mountainDensityWeight;
        return Math.min(Math.round(score * 100) / 100, 1.0);
    }
    identifyRegion(lat, lng) {
        if (lat >= 63 && lat <= 67 && lng >= -25 && lng <= -13)
            return 'iceland';
        if (lat >= 59 && lat <= 84 && lng >= -75 && lng <= -10)
            return 'greenland';
        if (lat >= 43 && lat <= 48 && lng >= 5 && lng <= 16)
            return 'alps';
        if (lat >= -47 && lat <= -40 && lng >= 166 && lng <= 175)
            return 'new-zealand-south-island';
        if (lat >= -56 && lat <= -22 && lng >= -73 && lng <= -53)
            return 'argentina';
        if (lat >= 61 && lat <= 63 && lng >= -8 && lng <= -6)
            return 'faroe-islands';
        if (lat >= 67 && lat <= 69 && lng >= 12 && lng <= 16)
            return 'lofoten';
        if (lat >= 74 && lat <= 81 && lng >= 10 && lng <= 35)
            return 'svalbard';
        return 'unknown';
    }
    calculateRiskScore(rivers, mountains, roads, coastlines, physicalReality, month) {
        var _a, _b, _c;
        let risk = 0;
        if (rivers.nearRiver) {
            risk += 0.12;
        }
        if (rivers.riverCrossingCount > 5) {
            risk += 0.10;
        }
        if (rivers.riverDensityScore > 0.7) {
            risk += 0.06;
        }
        if (mountains.inMountain) {
            risk += 0.12;
        }
        if (mountains.mountainElevationMax && mountains.mountainElevationMax > 3000) {
            risk += 0.10;
        }
        if (mountains.terrainComplexity > 0.7) {
            risk += 0.06;
        }
        if (!roads.nearRoad || roads.roadAccessibility < 0.3) {
            risk += 0.08;
        }
        if (coastlines.nearCoastline) {
            risk += 0.08;
        }
        if (coastlines.nearCoastline && mountains.inMountain) {
            risk += 0.06;
        }
        if (physicalReality) {
            (_a = physicalReality.weatherWindows) === null || _a === void 0 ? void 0 : _a.forEach((window) => {
                var _a;
                (_a = window.extremeEvents) === null || _a === void 0 ? void 0 : _a.forEach((event) => {
                    if (month && event.typicalMonths && !event.typicalMonths.includes(month)) {
                        return;
                    }
                    if (event.severity === 'extreme' || event.severity === 'very_high') {
                        risk += 0.05;
                    }
                    else if (event.severity === 'high') {
                        risk += 0.03;
                    }
                });
            });
            if (month) {
                (_b = physicalReality.weatherWindows) === null || _b === void 0 ? void 0 : _b.forEach((window) => {
                    var _a;
                    const riskLevel = (_a = window.riskLevels) === null || _a === void 0 ? void 0 : _a.find((r) => r.month === month);
                    if (riskLevel) {
                        if (riskLevel.riskLevel === 'extreme' || riskLevel.riskLevel === 'very_high') {
                            risk += 0.08;
                        }
                        else if (riskLevel.riskLevel === 'high') {
                            risk += 0.05;
                        }
                        else if (riskLevel.riskLevel === 'medium') {
                            risk += 0.03;
                        }
                    }
                });
            }
            (_c = physicalReality.roadStates) === null || _c === void 0 ? void 0 : _c.forEach((road) => {
                if (month && road.status === 'SEASONAL') {
                    if (road.seasonOpenFrom && road.seasonOpenTo) {
                        const isOpen = month >= road.seasonOpenFrom && month <= road.seasonOpenTo;
                        if (!isOpen) {
                            risk += 0.04;
                        }
                    }
                }
                else if (road.status === 'CLOSED') {
                    risk += 0.03;
                }
                else if (road.status === 'RESTRICTED') {
                    risk += 0.02;
                }
            });
        }
        return Math.min(Math.round(risk * 100) / 100, 1.0);
    }
    calculateAccessibilityScore(roads, ports, airlines, physicalReality, month) {
        var _a, _b, _c, _d, _e;
        const roadWeight = 0.5;
        const portWeight = 0.2;
        const airlineWeight = 0.3;
        const portAccessibility = ports.nearPort
            ? 1.0
            : Math.min(ports.portDensityScore * 0.5, 0.5);
        const airlineAccessibility = airlines.nearAirport
            ? 1.0
            : Math.min(airlines.airlineDensityScore * 0.5, 0.5);
        let score = roads.roadAccessibility * roadWeight +
            portAccessibility * portWeight +
            airlineAccessibility * airlineWeight;
        if (physicalReality) {
            const roadStatesCount = ((_a = physicalReality.roadStates) === null || _a === void 0 ? void 0 : _a.length) || 0;
            let accessibleRoadsCount = 0;
            if (roadStatesCount > 0) {
                accessibleRoadsCount = physicalReality.roadStates.filter((r) => {
                    if (r.status === 'OPEN') {
                        return true;
                    }
                    if (r.status === 'SEASONAL' && month && r.seasonOpenFrom && r.seasonOpenTo) {
                        return month >= r.seasonOpenFrom && month <= r.seasonOpenTo;
                    }
                    return false;
                }).length;
                const roadStateRatio = accessibleRoadsCount / roadStatesCount;
                score = score * 0.8 + roadStateRatio * 0.2;
            }
            const ferryStatesCount = ((_b = physicalReality.ferryStates) === null || _b === void 0 ? void 0 : _b.length) || 0;
            let accessibleFerriesCount = 0;
            if (ferryStatesCount > 0 && ports.nearPort) {
                accessibleFerriesCount = physicalReality.ferryStates.filter((f) => {
                    if (f.status === 'RUNNING') {
                        return true;
                    }
                    if (f.status === 'SEASONAL' && month && f.seasonOpenFrom && f.seasonOpenTo) {
                        return month >= f.seasonOpenFrom && month <= f.seasonOpenTo;
                    }
                    return false;
                }).length;
                const ferryStateRatio = accessibleFerriesCount / ferryStatesCount;
                score = score * 0.9 + ferryStateRatio * 0.1;
            }
            if (month) {
                const isInBestWindow = (_c = physicalReality.weatherWindows) === null || _c === void 0 ? void 0 : _c.some((window) => {
                    var _a;
                    return (_a = window.bestWindows) === null || _a === void 0 ? void 0 : _a.some((bestWindow) => {
                        return bestWindow.months.includes(month);
                    });
                });
                if (isInBestWindow) {
                    score = Math.min(score * 1.1, 1.0);
                }
                else {
                    const hasHighRisk = (_d = physicalReality.weatherWindows) === null || _d === void 0 ? void 0 : _d.some((window) => {
                        var _a;
                        const riskLevel = (_a = window.riskLevels) === null || _a === void 0 ? void 0 : _a.find((r) => r.month === month);
                        return riskLevel && (riskLevel.riskLevel === 'high' || riskLevel.riskLevel === 'very_high' || riskLevel.riskLevel === 'extreme');
                    });
                    if (hasHighRisk) {
                        score = score * 0.9;
                    }
                }
            }
            else {
                const bestWindows = ((_e = physicalReality.weatherWindows) === null || _e === void 0 ? void 0 : _e.flatMap((w) => w.bestWindows || [])) || [];
                if (bestWindows.length > 0) {
                    score = Math.min(score * 1.05, 1.0);
                }
            }
        }
        return Math.min(Math.round(score * 100) / 100, 1.0);
    }
};
exports.GeoFactsService = GeoFactsService;
exports.GeoFactsService = GeoFactsService = GeoFactsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [geo_facts_river_service_1.GeoFactsRiverService,
        geo_facts_mountain_service_1.GeoFactsMountainService,
        geo_facts_road_service_1.GeoFactsRoadService,
        geo_facts_coastline_service_1.GeoFactsCoastlineService,
        geo_facts_port_service_1.GeoFactsPortService,
        geo_facts_airline_service_1.GeoFactsAirlineService,
        geo_facts_poi_service_1.GeoFactsPOIService,
        geo_facts_cache_service_1.GeoFactsCacheService,
        physical_reality_retrieval_service_1.PhysicalRealityRetrievalService])
], GeoFactsService);
//# sourceMappingURL=geo-facts.service.js.map