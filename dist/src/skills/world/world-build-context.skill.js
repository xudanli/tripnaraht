"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WorldBuildContextSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorSeverity = exports.WorldModelError = exports.WorldBuildContextSkill = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const route_directions_service_1 = require("../../route-directions/route-directions.service");
const physical_reality_model_1 = require("../../trips/decision/models/physical-reality.model");
const human_capability_model_1 = require("../../trips/decision/models/human-capability.model");
const exa_integration_service_1 = require("../../mcp/exa-integration.service");
const dem_effort_metadata_service_1 = require("../../trips/dem/services/dem-effort-metadata.service");
const cache_service_1 = require("../../common/cache/cache.service");
const country_config_service_1 = require("./services/country-config.service");
const crypto = __importStar(require("crypto"));
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["CRITICAL"] = "critical";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["LOW"] = "low";
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
class WorldModelError extends Error {
    constructor(message, severity, recoverable = true, context) {
        super(message);
        this.severity = severity;
        this.recoverable = recoverable;
        this.context = context;
        this.name = 'WorldModelError';
    }
}
exports.WorldModelError = WorldModelError;
let WorldBuildContextSkill = WorldBuildContextSkill_1 = class WorldBuildContextSkill {
    constructor(prisma, routeDirectionsService, exaIntegration, demEffortMetadataService, cacheService, countryConfigService) {
        this.prisma = prisma;
        this.routeDirectionsService = routeDirectionsService;
        this.exaIntegration = exaIntegration;
        this.demEffortMetadataService = demEffortMetadataService;
        this.cacheService = cacheService;
        this.countryConfigService = countryConfigService;
        this.logger = new common_1.Logger(WorldBuildContextSkill_1.name);
        this.metadata = {
            name: 'world.buildContext',
            description: '构建完整的世界模型上下文（PhysicalRealityModel + HumanCapabilityModel + RouteDirection），一次性拉齐决策所需的所有数据',
            version: '1.0.0',
            category: 'world',
            inputSchema: {
                dependencies: [
                    { param: 'countryCode', alternatives: ['tripId'] },
                    { param: 'tripId', alternatives: ['countryCode'] },
                ],
                extractors: {
                    tripId: 'tripId',
                    countryCode: 'countryCode',
                },
            },
        };
        this.cachePrefix = 'world_model:';
        this.cacheTtlSeconds = 3600;
        if (this.cacheService) {
            this.logger.log('✅ 世界模型缓存已启用');
        }
        else {
            this.logger.debug('⚠️ 缓存服务不可用，世界模型构建将不使用缓存');
        }
    }
    async execute(input) {
        var _a, _b, _c, _d, _e;
        this.logger.debug(`执行 world.buildContext: tripId=${input.tripId || 'none'}, countryCode=${input.countryCode || 'none'}`);
        const cacheKey = this.generateCacheKey(input);
        if (this.cacheService) {
            try {
                const cached = await this.cacheService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`✅ 从缓存获取世界模型: ${cacheKey}`);
                    return cached;
                }
            }
            catch (error) {
                this.logger.warn(`缓存获取失败: ${error.message}，继续构建`);
            }
        }
        const missingPieces = {};
        try {
            let trip = null;
            let countryCode;
            let season;
            let routeDirectionId;
            let partyProfile;
            if (input.tripId) {
                trip = await this.prisma.trip.findUnique({
                    where: { id: input.tripId },
                    include: {
                        TripDay: {
                            include: {
                                ItineraryItem: {
                                    include: {
                                        Place: true,
                                    },
                                    orderBy: {
                                        order: 'asc',
                                    },
                                },
                            },
                            orderBy: {
                                date: 'asc',
                            },
                        },
                    },
                });
                if (!trip) {
                    throw new WorldModelError(`行程不存在: ${input.tripId}`, ErrorSeverity.CRITICAL, false, { tripId: input.tripId });
                }
                const tripMetadata = trip.metadata;
                countryCode = (tripMetadata === null || tripMetadata === void 0 ? void 0 : tripMetadata.countryCode) || trip.destination || trip.countryCode || input.countryCode || '';
                season = trip.startDate ? new Date(trip.startDate).getMonth() + 1 : (input.season || 1);
                routeDirectionId = trip.routeDirectionId || input.routeDirectionId;
                const pacingConfig = trip.pacingConfig;
                partyProfile = {
                    mobilityProfile: pacingConfig === null || pacingConfig === void 0 ? void 0 : pacingConfig.mobilityProfile,
                    riskTolerance: pacingConfig === null || pacingConfig === void 0 ? void 0 : pacingConfig.riskTolerance,
                    fitness: pacingConfig === null || pacingConfig === void 0 ? void 0 : pacingConfig.fitness,
                    pace: pacingConfig === null || pacingConfig === void 0 ? void 0 : pacingConfig.pace,
                };
            }
            else {
                countryCode = input.countryCode || '';
                season = input.season || 1;
                routeDirectionId = input.routeDirectionId;
                partyProfile = input.partyProfile;
            }
            if (!countryCode) {
                throw new WorldModelError('countryCode 是必需的（可通过 tripId 或直接传入）', ErrorSeverity.CRITICAL, false);
            }
            const human = this.buildHumanCapabilityModel(partyProfile);
            if (!human) {
                missingPieces.humanProfileIncomplete = true;
            }
            let routeDirection;
            if (!this.routeDirectionsService) {
                this.logger.warn('RouteDirectionsService 不可用，将使用空的 RouteDirection');
                missingPieces.routeDirectionMissing = true;
            }
            else {
                try {
                    if (routeDirectionId) {
                        routeDirection = await this.routeDirectionsService.findRouteDirectionByUuid(routeDirectionId);
                    }
                    else {
                        const routeDirectionsResult = await this.routeDirectionsService.findRouteDirectionsByCountry(countryCode, {
                            month: season,
                            limit: 1,
                        });
                        routeDirection = (_a = routeDirectionsResult.active) === null || _a === void 0 ? void 0 : _a[0];
                    }
                }
                catch (error) {
                    this.logger.warn(`获取 RouteDirection 失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
                    missingPieces.routeDirectionMissing = true;
                }
            }
            if (!routeDirection) {
                this.logger.warn(`未找到 RouteDirection (country: ${countryCode}, season: ${season})，将使用空 RouteDirection`);
                missingPieces.routeDirectionMissing = true;
                routeDirection = {
                    id: 'unknown',
                    uuid: 'unknown',
                    name: `Unknown Route for ${countryCode}`,
                    countryCode,
                    tags: [],
                };
            }
            let demEvidence = [];
            if (trip && trip.TripDay && trip.TripDay.length > 0 && this.demEffortMetadataService) {
                try {
                    const routePoints = [];
                    for (const day of trip.TripDay) {
                        if (day.ItineraryItem && day.ItineraryItem.length > 0) {
                            for (const item of day.ItineraryItem) {
                                let lat = null;
                                let lng = null;
                                if ((_b = item.Place) === null || _b === void 0 ? void 0 : _b.location) {
                                    const locationResult = await this.prisma.$queryRaw `
                    SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
                    FROM "Place"
                    WHERE id = ${item.Place.id}
                  `;
                                    if (locationResult === null || locationResult === void 0 ? void 0 : locationResult[0]) {
                                        lat = parseFloat(locationResult[0].lat);
                                        lng = parseFloat(locationResult[0].lng);
                                    }
                                }
                                if (!lat || !lng) {
                                    const itemMetadata = item.metadata;
                                    const placeMetadata = (_c = item.Place) === null || _c === void 0 ? void 0 : _c.metadata;
                                    const coords = (itemMetadata === null || itemMetadata === void 0 ? void 0 : itemMetadata.coordinates) || (placeMetadata === null || placeMetadata === void 0 ? void 0 : placeMetadata.coordinates);
                                    if (coords && typeof coords === 'object' && 'lat' in coords && 'lng' in coords) {
                                        lat = coords.lat;
                                        lng = coords.lng;
                                    }
                                }
                                if (lat && lng) {
                                    routePoints.push({ lat, lng });
                                }
                            }
                        }
                    }
                    if (routePoints.length >= 2) {
                        this.logger.debug(`从行程提取 ${routePoints.length} 个路线点，生成 DEM 证据`);
                        const effortMetadata = await this.demEffortMetadataService.calculateEffortMetadata(routePoints, {
                            activityType: 'driving',
                            samplingInterval: 100,
                            includeElevationProfile: true,
                        });
                        const days = trip.TripDay.length;
                        const avgDailyAscent = effortMetadata.totalAscent / days;
                        const rollingAscent3Days = Math.min(effortMetadata.totalAscent, avgDailyAscent * 3);
                        const fatigueIndex = Math.min(100, (effortMetadata.totalAscent / 1000) * 10 +
                            (effortMetadata.maxSlope / 10) +
                            (effortMetadata.totalDistance / 100000));
                        demEvidence = [{
                                segmentId: `trip_${input.tripId}_full_route`,
                                elevationProfile: ((_d = effortMetadata.elevationProfile) === null || _d === void 0 ? void 0 : _d.map(p => p.elevation)) || [],
                                cumulativeAscent: effortMetadata.totalAscent,
                                maxSlopePct: effortMetadata.maxSlope,
                                rollingAscent3Days,
                                fatigueIndex,
                                violation: 'NONE',
                                explanation: `基于实际行程路线生成：${routePoints.length} 个路线点，总距离 ${(effortMetadata.totalDistance / 1000).toFixed(1)}km，累计爬升 ${effortMetadata.totalAscent.toFixed(1)}m`,
                                metadata: {
                                    elevationRange: {
                                        min: effortMetadata.minElevation,
                                        max: effortMetadata.maxElevation,
                                    },
                                    distanceM: effortMetadata.totalDistance,
                                    avgSlopePct: effortMetadata.avgSlope,
                                },
                            }];
                        this.logger.debug(`DEM 证据生成成功：累计爬升 ${effortMetadata.totalAscent.toFixed(1)}m，最大坡度 ${effortMetadata.maxSlope.toFixed(2)}%`);
                    }
                    else {
                        this.logger.warn(`行程路线点不足（${routePoints.length} 个），尝试从RouteDirection生成DEM证据`);
                    }
                }
                catch (error) {
                    if (error instanceof WorldModelError && error.severity === ErrorSeverity.CRITICAL) {
                        throw error;
                    }
                    this.logger.warn(`从行程生成 DEM 证据失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}，尝试从RouteDirection生成`);
                }
            }
            if (demEvidence.length === 0 && routeDirection && this.demEffortMetadataService) {
                try {
                    const corridorGeom = routeDirection.corridorGeom;
                    if (corridorGeom) {
                        this.logger.debug(`从RouteDirection的corridorGeom生成DEM证据`);
                        const routePoints = await this.extractPointsFromCorridorGeometry(corridorGeom);
                        if (routePoints.length >= 2) {
                            this.logger.debug(`从corridorGeom提取 ${routePoints.length} 个路线点`);
                            const effortMetadata = await this.demEffortMetadataService.calculateEffortMetadata(routePoints, {
                                activityType: 'driving',
                                samplingInterval: 100,
                                includeElevationProfile: true,
                            });
                            const estimatedDays = input.duration || 8;
                            const avgDailyAscent = effortMetadata.totalAscent / estimatedDays;
                            const rollingAscent3Days = Math.min(effortMetadata.totalAscent, avgDailyAscent * 3);
                            const fatigueIndex = Math.min(100, (effortMetadata.totalAscent / 1000) * 10 +
                                (effortMetadata.maxSlope / 10) +
                                (effortMetadata.totalDistance / 100000));
                            demEvidence = [{
                                    segmentId: `route_${routeDirection.uuid || routeDirection.id}_corridor`,
                                    elevationProfile: ((_e = effortMetadata.elevationProfile) === null || _e === void 0 ? void 0 : _e.map(p => p.elevation)) || [],
                                    cumulativeAscent: effortMetadata.totalAscent,
                                    maxSlopePct: effortMetadata.maxSlope,
                                    rollingAscent3Days,
                                    fatigueIndex,
                                    violation: 'NONE',
                                    explanation: `基于RouteDirection corridorGeom生成（source: route_direction_corridor）：${routePoints.length} 个路线点，总距离 ${(effortMetadata.totalDistance / 1000).toFixed(1)}km，累计爬升 ${effortMetadata.totalAscent.toFixed(1)}m`,
                                    metadata: {
                                        elevationRange: {
                                            min: effortMetadata.minElevation,
                                            max: effortMetadata.maxElevation,
                                        },
                                        distanceM: effortMetadata.totalDistance,
                                        avgSlopePct: effortMetadata.avgSlope,
                                    },
                                }];
                            this.logger.debug(`从RouteDirection生成DEM证据成功：累计爬升 ${effortMetadata.totalAscent.toFixed(1)}m，最大坡度 ${effortMetadata.maxSlope.toFixed(2)}%`);
                        }
                        else {
                            this.logger.warn(`从corridorGeom提取的路线点不足（${routePoints.length} 个）`);
                        }
                    }
                    else {
                        this.logger.debug(`RouteDirection没有corridorGeom，无法生成DEM证据`);
                    }
                }
                catch (error) {
                    if (error instanceof WorldModelError && error.severity === ErrorSeverity.CRITICAL) {
                        throw error;
                    }
                    this.logger.warn(`从RouteDirection生成DEM证据失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
                }
            }
            if (demEvidence.length === 0) {
                demEvidence = [
                    {
                        segmentId: 'placeholder_no_plan_yet',
                        elevationProfile: [],
                        cumulativeAscent: 0,
                        maxSlopePct: 0,
                        rollingAscent3Days: 0,
                        fatigueIndex: 0,
                        violation: 'NONE',
                        explanation: trip
                            ? '占位符：行程路线点不足或坐标信息缺失，DEM 证据将在路线规划完成后填充'
                            : routeDirection
                                ? '占位符：RouteDirection没有corridorGeom，DEM 证据将在计划生成后填充'
                                : '占位符：计划生成阶段尚未有具体路线，DEM 证据将在计划生成后填充',
                    },
                ];
                missingPieces.physicalRealityIncomplete = true;
            }
            else {
                missingPieces.physicalRealityIncomplete = false;
            }
            this.validateInputParameters(countryCode, season);
            const physical = {
                demEvidence,
                roadStates: [],
                hazardZones: [],
                ferryStates: [],
                countryCode,
                month: season,
            };
            const physicalValidation = (0, physical_reality_model_1.validatePhysicalRealityModel)(physical);
            if (!physicalValidation.valid) {
                this.logger.warn(`PhysicalRealityModel 验证失败，缺失字段: ${physicalValidation.missingFields.join(', ')}`);
            }
            if (this.exaIntegration && routeDirection) {
                try {
                    const routeName = routeDirection.name || routeDirectionId || '';
                    const realTimeRiskInfo = await this.exaIntegration.searchRealTimeRisks(countryCode, routeName, season, new Date().getFullYear());
                    if (realTimeRiskInfo.hasRisk) {
                        this.logger.debug(`检测到实时风险信息: ${realTimeRiskInfo.riskType} - ${realTimeRiskInfo.riskDescription}`);
                        if (realTimeRiskInfo.riskType === 'ROAD_CLOSED' || realTimeRiskInfo.riskType === 'TRANSPORT') {
                            physical.roadStates.push({
                                roadId: `realtime_${Date.now()}`,
                                status: 'CLOSED',
                                metadata: {
                                    reason: realTimeRiskInfo.riskDescription || '实时信息显示道路封闭',
                                    source: 'EXA_REALTIME',
                                    riskType: realTimeRiskInfo.riskType,
                                    confidence: realTimeRiskInfo.confidence,
                                },
                            });
                        }
                        else if (realTimeRiskInfo.riskType === 'WEATHER' ||
                            realTimeRiskInfo.riskType === 'GEOLOGICAL') {
                            const hazardType = realTimeRiskInfo.riskType === 'WEATHER'
                                ? 'FLOOD'
                                : 'MUDSLIDE';
                            physical.hazardZones.push({
                                zoneId: `realtime_${Date.now()}`,
                                type: hazardType,
                                level: 'HIGH',
                                seasonality: {
                                    highRiskMonths: [season],
                                    lowRiskMonths: [],
                                },
                                metadata: {
                                    description: realTimeRiskInfo.riskDescription || '实时信息显示高风险',
                                    source: 'EXA_REALTIME',
                                    riskType: realTimeRiskInfo.riskType,
                                    confidence: realTimeRiskInfo.confidence,
                                },
                            });
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`Exa real-time info search failed: ${error.message}, continuing without real-time data`);
                }
            }
            if (demEvidence.length > 0 && demEvidence[0].segmentId === 'placeholder_no_plan_yet') {
                missingPieces.physicalRealityIncomplete = true;
            }
            const complianceEvidence = this.buildComplianceEvidence(routeDirection);
            const world = {
                physical,
                human: human || (0, human_capability_model_1.createHumanCapabilityModelFromProfile)('default', { pace: 'normal', fitness: 'medium', riskTolerance: 'medium' }),
                routeDirection: routeDirection,
                complianceEvidence: complianceEvidence.length > 0 ? complianceEvidence : undefined,
            };
            const worldValidation = this.validateWorldModelContext(world);
            if (!worldValidation.valid) {
                this.logger.error(`WorldModelContext验证失败: ${worldValidation.errors.join('; ')}`);
                if (worldValidation.errors.length > 0) {
                    throw new WorldModelError(`WorldModelContext验证失败: ${worldValidation.errors.join('; ')}`, ErrorSeverity.CRITICAL, false, { errors: worldValidation.errors, warnings: worldValidation.warnings });
                }
            }
            if (worldValidation.warnings.length > 0) {
                this.logger.warn(`WorldModelContext验证警告: ${worldValidation.warnings.join('; ')}`);
            }
            const result = {
                world,
                missingPieces,
            };
            if (this.cacheService) {
                try {
                    await this.cacheService.set(cacheKey, result, this.cacheTtlSeconds);
                    this.logger.debug(`✅ 世界模型已存入缓存: ${cacheKey} (TTL: ${this.cacheTtlSeconds}s)`);
                }
                catch (error) {
                    this.logger.warn(`缓存写入失败: ${error.message}`);
                }
            }
            return result;
        }
        catch (error) {
            if (error instanceof WorldModelError) {
                if (error.severity === ErrorSeverity.CRITICAL) {
                    this.logger.error(`构建 WorldModelContext 失败（CRITICAL）: ${error.message}`, error.stack);
                    throw error;
                }
                else {
                    this.logger.warn(`构建 WorldModelContext 失败（${error.severity}）: ${error.message}`, error.context);
                    throw error;
                }
            }
            else {
                this.logger.error(`构建 WorldModelContext 失败（未知错误）: ${error.message}`, error.stack);
                throw new WorldModelError(`构建 WorldModelContext 失败: ${error.message}`, ErrorSeverity.CRITICAL, false, { originalError: error.message });
            }
        }
    }
    buildHumanCapabilityModel(partyProfile) {
        if (!partyProfile) {
            return null;
        }
        const paceMap = {
            relaxed: 'slow',
            moderate: 'normal',
            intense: 'fast',
        };
        return (0, human_capability_model_1.createHumanCapabilityModelFromProfile)(`party-${Date.now()}`, {
            pace: paceMap[partyProfile.pace || 'moderate'] || 'normal',
            fitness: partyProfile.fitness || 'medium',
            riskTolerance: partyProfile.riskTolerance || 'medium',
        });
    }
    buildComplianceEvidence(routeDirection) {
        return [];
    }
    validateInputParameters(countryCode, season) {
        if (!countryCode || typeof countryCode !== 'string' || countryCode.length !== 2) {
            throw new WorldModelError(`无效的countryCode: ${countryCode}，必须是2位ISO国家代码`, ErrorSeverity.CRITICAL, false, { countryCode });
        }
        if (!Number.isInteger(season) || season < 1 || season > 12) {
            throw new WorldModelError(`无效的season: ${season}，必须是1-12之间的整数`, ErrorSeverity.CRITICAL, false, { season });
        }
    }
    generateCacheKey(input) {
        const parts = [];
        if (input.tripId) {
            parts.push(`trip:${input.tripId}`);
        }
        else {
            parts.push(`country:${input.countryCode || 'unknown'}`);
            parts.push(`season:${input.season || 1}`);
            if (input.routeDirectionId) {
                parts.push(`route:${input.routeDirectionId}`);
            }
            if (input.partyProfile) {
                const profileHash = crypto
                    .createHash('md5')
                    .update(JSON.stringify(input.partyProfile))
                    .digest('hex')
                    .substring(0, 8);
                parts.push(`profile:${profileHash}`);
            }
        }
        const key = `${this.cachePrefix}${parts.join(':')}`;
        return key;
    }
    validateWorldModelContext(world) {
        const errors = [];
        const warnings = [];
        const physicalValidation = (0, physical_reality_model_1.validatePhysicalRealityModel)(world.physical);
        if (!physicalValidation.valid) {
            errors.push(`PhysicalRealityModel验证失败: ${physicalValidation.missingFields.join(', ')}`);
        }
        if (!world.human) {
            errors.push('HumanCapabilityModel缺失');
        }
        else {
            if (world.human.maxDailyAscentM <= 0) {
                warnings.push('HumanCapabilityModel.maxDailyAscentM无效或未设置');
            }
            if (!world.human.preferredPace) {
                warnings.push('HumanCapabilityModel.preferredPace未设置');
            }
        }
        if (!world.routeDirection) {
            warnings.push('RouteDirection缺失，将使用默认值');
        }
        else {
            if (!world.routeDirection.countryCode) {
                warnings.push('RouteDirection.countryCode缺失');
            }
            if (!world.routeDirection.name && !world.routeDirection.nameCN) {
                warnings.push('RouteDirection名称缺失');
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    async extractPointsFromCorridorGeometry(corridorGeom, samplingInterval = 100) {
        var _a;
        const routePoints = [];
        try {
            if (typeof corridorGeom === 'string') {
                const wktMatch = corridorGeom.match(/LINESTRING\s*\(([^)]+)\)/i);
                if (wktMatch) {
                    const coordsStr = wktMatch[1];
                    const coordPairs = coordsStr.split(',').map(s => s.trim());
                    for (const pair of coordPairs) {
                        const parts = pair.trim().split(/\s+/);
                        if (parts.length >= 2) {
                            const lng = parseFloat(parts[0]);
                            const lat = parseFloat(parts[1]);
                            if (!isNaN(lat) && !isNaN(lng)) {
                                routePoints.push({ lat, lng });
                            }
                        }
                    }
                }
            }
            else if (corridorGeom && typeof corridorGeom === 'object') {
                try {
                    const wktResult = await this.prisma.$queryRaw `
            SELECT ST_AsText(${corridorGeom}::geography::geometry) as wkt
          `;
                    if ((_a = wktResult === null || wktResult === void 0 ? void 0 : wktResult[0]) === null || _a === void 0 ? void 0 : _a.wkt) {
                        const wkt = wktResult[0].wkt;
                        const wktMatch = wkt.match(/LINESTRING\s*\(([^)]+)\)/i);
                        if (wktMatch) {
                            const coordsStr = wktMatch[1];
                            const coordPairs = coordsStr.split(',').map((s) => s.trim());
                            const step = Math.max(1, Math.floor(coordPairs.length / Math.max(1, Math.floor(samplingInterval / 50))));
                            for (let i = 0; i < coordPairs.length; i += step) {
                                const parts = coordPairs[i].trim().split(/\s+/);
                                if (parts.length >= 2) {
                                    const lng = parseFloat(parts[0]);
                                    const lat = parseFloat(parts[1]);
                                    if (!isNaN(lat) && !isNaN(lng)) {
                                        routePoints.push({ lat, lng });
                                    }
                                }
                            }
                        }
                    }
                    else {
                        const pointsResult = await this.prisma.$queryRaw `
              SELECT 
                ST_Y((dp).geom) as lat,
                ST_X((dp).geom) as lng
              FROM (
                SELECT ST_DumpPoints(${corridorGeom}::geography::geometry) as dp
              ) as dumped
              ORDER BY (dp).path[1]
            `;
                        const step = Math.max(1, Math.floor((pointsResult.length || 0) / Math.max(1, Math.floor(samplingInterval / 50))));
                        for (let i = 0; i < (pointsResult.length || 0); i += step) {
                            const point = pointsResult[i];
                            if ((point === null || point === void 0 ? void 0 : point.lat) && (point === null || point === void 0 ? void 0 : point.lng)) {
                                routePoints.push({
                                    lat: parseFloat(point.lat),
                                    lng: parseFloat(point.lng),
                                });
                            }
                        }
                    }
                }
                catch (sqlError) {
                    this.logger.warn(`从PostGIS geometry提取坐标点失败: ${sqlError.message}`);
                }
            }
            if (routePoints.length === 0 && corridorGeom && typeof corridorGeom === 'object') {
                const metadata = corridorGeom.metadata || {};
                if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
                    for (const coord of metadata.coordinates) {
                        if (coord.lat && coord.lng) {
                            routePoints.push({ lat: coord.lat, lng: coord.lng });
                        }
                        else if (Array.isArray(coord) && coord.length >= 2) {
                            routePoints.push({ lat: coord[1], lng: coord[0] });
                        }
                    }
                }
            }
            this.logger.debug(`从corridorGeom提取了 ${routePoints.length} 个坐标点`);
        }
        catch (error) {
            if (error instanceof WorldModelError && error.severity === ErrorSeverity.CRITICAL) {
                throw error;
            }
            this.logger.warn(`提取corridorGeom坐标点失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
        }
        return routePoints;
    }
};
exports.WorldBuildContextSkill = WorldBuildContextSkill;
exports.WorldBuildContextSkill = WorldBuildContextSkill = WorldBuildContextSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        route_directions_service_1.RouteDirectionsService,
        exa_integration_service_1.ExaIntegrationService,
        dem_effort_metadata_service_1.DEMEffortMetadataService,
        cache_service_1.CacheService,
        country_config_service_1.CountryConfigService])
], WorldBuildContextSkill);
//# sourceMappingURL=world-build-context.skill.js.map