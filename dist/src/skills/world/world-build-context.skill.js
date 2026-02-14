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
var WorldBuildContextSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldBuildContextSkill = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const route_directions_service_1 = require("../../route-directions/route-directions.service");
const human_capability_model_1 = require("../../trips/decision/models/human-capability.model");
const exa_integration_service_1 = require("../../mcp/exa-integration.service");
let WorldBuildContextSkill = WorldBuildContextSkill_1 = class WorldBuildContextSkill {
    constructor(prisma, routeDirectionsService, exaIntegration) {
        this.prisma = prisma;
        this.routeDirectionsService = routeDirectionsService;
        this.exaIntegration = exaIntegration;
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
    }
    async execute(input) {
        var _a;
        this.logger.debug(`执行 world.buildContext: tripId=${input.tripId || 'none'}, countryCode=${input.countryCode || 'none'}`);
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
                        TripDay: true,
                    },
                });
                if (!trip) {
                    throw new common_1.NotFoundException(`行程不存在: ${input.tripId}`);
                }
                countryCode = trip.destination || trip.countryCode || input.countryCode || '';
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
                throw new Error('countryCode 是必需的（可通过 tripId 或直接传入）');
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
            const physical = {
                demEvidence: [
                    {
                        segmentId: 'placeholder_no_plan_yet',
                        elevationProfile: [],
                        cumulativeAscent: 0,
                        maxSlopePct: 0,
                        rollingAscent3Days: 0,
                        fatigueIndex: 0,
                        violation: 'NONE',
                        explanation: '占位符：计划生成阶段尚未有具体路线，DEM 证据将在计划生成后填充',
                    },
                ],
                roadStates: [],
                hazardZones: [],
                ferryStates: [],
                countryCode,
                month: season,
            };
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
            missingPieces.physicalRealityIncomplete = true;
            const complianceEvidence = this.buildComplianceEvidence(routeDirection);
            const world = {
                physical,
                human: human || (0, human_capability_model_1.createHumanCapabilityModelFromProfile)('default', { pace: 'normal', fitness: 'medium', riskTolerance: 'medium' }),
                routeDirection: routeDirection,
                complianceEvidence: complianceEvidence.length > 0 ? complianceEvidence : undefined,
            };
            return {
                world,
                missingPieces,
            };
        }
        catch (error) {
            this.logger.error(`构建 WorldModelContext 失败: ${error.message}`, error.stack);
            throw error;
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
};
exports.WorldBuildContextSkill = WorldBuildContextSkill;
exports.WorldBuildContextSkill = WorldBuildContextSkill = WorldBuildContextSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        route_directions_service_1.RouteDirectionsService,
        exa_integration_service_1.ExaIntegrationService])
], WorldBuildContextSkill);
//# sourceMappingURL=world-build-context.skill.js.map