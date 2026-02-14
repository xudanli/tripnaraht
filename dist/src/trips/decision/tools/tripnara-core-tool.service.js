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
var TripNaraCoreToolService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripNaraCoreToolService = void 0;
const common_1 = require("@nestjs/common");
const strategy_orchestrator_service_1 = require("../services/strategy-orchestrator.service");
const tripnara_core_tool_interface_1 = require("./tripnara-core-tool.interface");
const human_capability_model_1 = require("../models/human-capability.model");
const route_directions_service_1 = require("../../../route-directions/route-directions.service");
const dem_decision_evidence_pipeline_service_1 = require("../services/dem-decision-evidence-pipeline.service");
const physical_reality_retrieval_service_1 = require("../../readiness/services/physical-reality-retrieval.service");
let TripNaraCoreToolService = TripNaraCoreToolService_1 = class TripNaraCoreToolService {
    constructor(orchestrator, routeDirectionsService, demEvidencePipeline, physicalRealityService) {
        this.orchestrator = orchestrator;
        this.routeDirectionsService = routeDirectionsService;
        this.demEvidencePipeline = demEvidencePipeline;
        this.physicalRealityService = physicalRealityService;
        this.logger = new common_1.Logger(TripNaraCoreToolService_1.name);
    }
    async execute(input) {
        this.logger.debug(`执行 TripNARA Core Tool: ${JSON.stringify(input)}`);
        try {
            this.validateInput(input);
            const world = await this.buildWorldModelContext(input);
            const plan = input.initialPlan || await this.buildInitialPlan(input);
            const result = await this.orchestrator.run(world, plan);
            return this.convertToToolOutput(result, input);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`TripNARA Core Tool 执行失败: ${errorMessage}`, errorStack);
            throw new tripnara_core_tool_interface_1.TripNaraCoreToolError(`执行失败: ${errorMessage}`, 'EXECUTION_FAILED', { originalError: errorMessage });
        }
    }
    getDescription() {
        return `TripNARA 核心决策引擎。基于物理现实、人体能力和路线哲学进行路线规划决策。
    
功能：
- 安全评估（Abu）：检查 DEM 硬违规、道路状态、危险区域
- 节奏调整（Dr.Dre）：基于人体能力模型调整行程节奏
- 空间修复（Neptune）：在保持路线哲学的前提下替换不可用路段

输入参数：
- countryCode: 国家代码（如 "IS"）
- month: 月份（1-12）
- routeDirectionId: 路线方向 ID
- humanCapability: 用户能力参数

输出：
- allowed: 是否允许
- plan: 最终路线计划
- action: 决策动作（ALLOW/REJECT/ADJUST/REPLACE）
- logs: 决策日志
- explanation: 可读解释`;
    }
    getSchema() {
        return {
            type: 'object',
            properties: {
                countryCode: {
                    type: 'string',
                    description: '国家代码（ISO 3166-1 alpha-2），如 "IS" 表示冰岛',
                },
                month: {
                    type: 'number',
                    description: '月份（1-12）',
                    minimum: 1,
                    maximum: 12,
                },
                routeDirectionId: {
                    type: 'string',
                    description: '路线方向 ID',
                },
                humanCapability: {
                    type: 'object',
                    description: '用户能力参数',
                    properties: {
                        maxDailyAscentM: {
                            type: 'number',
                            description: '单日最大爬升（米）',
                        },
                        rollingAscent3DaysM: {
                            type: 'number',
                            description: '连续 3 天滚动爬升（米）',
                        },
                        maxSlopePct: {
                            type: 'number',
                            description: '最大坡度（百分比）',
                        },
                        preferredPace: {
                            type: 'string',
                            enum: ['SLOW', 'MEDIUM', 'FAST'],
                            description: '节奏偏好',
                        },
                        riskTolerance: {
                            type: 'string',
                            enum: ['LOW', 'MEDIUM', 'HIGH'],
                            description: '风险承受度',
                        },
                        highAltitudeExperience: {
                            type: 'string',
                            enum: ['NONE', 'BASIC', 'ADVANCED'],
                            description: '高海拔经验',
                        },
                        specialConstraints: {
                            type: 'array',
                            items: { type: 'string' },
                            description: '特殊限制（例如：["膝盖不好", "恐高"]）',
                        },
                    },
                },
                initialPlan: {
                    type: 'object',
                    description: '初始路线计划（可选）',
                },
                metadata: {
                    type: 'object',
                    description: '元数据（用于传递上下文）',
                },
            },
            required: ['countryCode', 'month', 'routeDirectionId', 'humanCapability'],
        };
    }
    validateInput(input) {
        if (!input.countryCode) {
            throw new tripnara_core_tool_interface_1.TripNaraCoreToolError('countryCode 是必需的', 'INVALID_INPUT');
        }
        if (!input.month || input.month < 1 || input.month > 12) {
            throw new tripnara_core_tool_interface_1.TripNaraCoreToolError('month 必须是 1-12 之间的数字', 'INVALID_INPUT');
        }
        if (!input.routeDirectionId) {
            throw new tripnara_core_tool_interface_1.TripNaraCoreToolError('routeDirectionId 是必需的', 'INVALID_INPUT');
        }
        if (!input.humanCapability) {
            throw new tripnara_core_tool_interface_1.TripNaraCoreToolError('humanCapability 是必需的', 'INVALID_INPUT');
        }
    }
    async buildWorldModelContext(input) {
        this.logger.debug('开始构建 WorldModelContext');
        const humanCapability = this.buildHumanCapabilityModel(input);
        const routeDirection = await this.getRouteDirection(input);
        const physical = await this.buildPhysicalRealityModel(input, routeDirection);
        const complianceEvidence = this.buildComplianceEvidence(routeDirection);
        return {
            physical,
            human: humanCapability,
            routeDirection,
            complianceEvidence: complianceEvidence.length > 0 ? complianceEvidence : undefined,
        };
    }
    buildHumanCapabilityModel(input) {
        var _a, _b;
        let fitness = 'medium';
        if (input.humanCapability.specialConstraints) {
            const constraints = input.humanCapability.specialConstraints;
            if (constraints.some(c => c.includes('膝盖') || c.includes('受伤') || c.includes('疾病'))) {
                fitness = 'low';
            }
            else if (constraints.some(c => c.includes('专业') || c.includes('经验丰富'))) {
                fitness = 'high';
            }
        }
        const humanCapability = (0, human_capability_model_1.createHumanCapabilityModelFromProfile)(`tool-profile-${Date.now()}`, {
            pace: ((_a = input.humanCapability.preferredPace) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'normal',
            fitness,
            riskTolerance: ((_b = input.humanCapability.riskTolerance) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || 'medium',
        });
        if (input.humanCapability.maxDailyAscentM) {
            humanCapability.maxDailyAscentM = input.humanCapability.maxDailyAscentM;
        }
        if (input.humanCapability.rollingAscent3DaysM) {
            humanCapability.rollingAscent3DaysM = input.humanCapability.rollingAscent3DaysM;
        }
        if (input.humanCapability.maxSlopePct) {
            humanCapability.maxSlopePct = input.humanCapability.maxSlopePct;
        }
        if (input.humanCapability.highAltitudeExperience) {
            humanCapability.highAltitudeExperience = input.humanCapability.highAltitudeExperience;
        }
        return humanCapability;
    }
    async getRouteDirection(input) {
        if (!this.routeDirectionsService) {
            throw new tripnara_core_tool_interface_1.TripNaraCoreToolError('RouteDirectionsService 未注入，无法获取 RouteDirection', 'EXECUTION_FAILED');
        }
        const routeDirections = await this.routeDirectionsService.findRouteDirections({
            countryCode: input.countryCode,
        });
        let routeDirection = routeDirections.find(rd => rd.uuid === input.routeDirectionId || String(rd.id) === input.routeDirectionId);
        if (!routeDirection) {
            routeDirection = routeDirections[0];
            if (!routeDirection) {
                throw new tripnara_core_tool_interface_1.TripNaraCoreToolError(`未找到 RouteDirection: ${input.routeDirectionId} (country: ${input.countryCode})`, 'EXECUTION_FAILED');
            }
            this.logger.warn(`未找到精确匹配的 RouteDirection ${input.routeDirectionId}，使用第一个匹配: ${routeDirection.uuid}`);
        }
        return routeDirection;
    }
    async buildPhysicalRealityModel(input, routeDirection) {
        var _a, _b, _c;
        const physical = {
            demEvidence: [],
            roadStates: [],
            hazardZones: [],
            ferryStates: [],
            countryCode: input.countryCode,
            month: input.month,
        };
        if (input.initialPlan && this.demEvidencePipeline) {
            this.logger.debug('有初始计划，但 DEM 证据生成需要 TripPlan 结构，暂时跳过');
        }
        if (this.physicalRealityService) {
            try {
                const region = this.identifyRegionFromCountryCode(input.countryCode, routeDirection);
                if (region && region !== 'unknown') {
                    this.logger.debug(`检索Physical Reality数据: region=${region}, month=${input.month}`);
                    const routeCoords = this.extractRouteCoordinates(routeDirection);
                    const physicalRealityData = await this.physicalRealityService.retrievePhysicalRealityData(region, {
                        lat: routeCoords === null || routeCoords === void 0 ? void 0 : routeCoords.lat,
                        lng: routeCoords === null || routeCoords === void 0 ? void 0 : routeCoords.lng,
                        month: input.month,
                        limit: 20,
                    });
                    physicalRealityData.roadStates.forEach((road) => {
                        physical.roadStates.push({
                            roadId: road.roadId,
                            status: road.status,
                            seasonOpenFrom: road.seasonOpenFrom,
                            seasonOpenTo: road.seasonOpenTo,
                            requires4x4: road.requires4x4,
                            metadata: road.metadata,
                        });
                    });
                    physicalRealityData.ferryStates.forEach((ferry) => {
                        physical.ferryStates.push({
                            ferryId: ferry.routeId,
                            routeId: ferry.routeId,
                            status: ferry.status,
                            seasonOpenFrom: ferry.seasonOpenFrom,
                            seasonOpenTo: ferry.seasonOpenTo,
                            metadata: ferry.metadata,
                        });
                    });
                    if (physicalRealityData.weatherWindows.length > 0) {
                        const weatherWindow = physicalRealityData.weatherWindows[0];
                        const riskLevel = (_a = weatherWindow.riskLevels) === null || _a === void 0 ? void 0 : _a.find((r) => r.month === input.month);
                        if (riskLevel) {
                            const accessibilityScore = this.calculateAccessibilityScoreFromRiskLevel(riskLevel.riskLevel);
                            physical.climateSeasonality = {
                                countryCode: input.countryCode,
                                month: input.month,
                                accessibilityScore,
                                riskFactors: riskLevel.risks,
                                metadata: {
                                    regionId: weatherWindow.regionId,
                                    regionName: weatherWindow.regionName,
                                },
                            };
                        }
                    }
                    this.logger.debug(`Physical Reality数据检索完成: ${physical.roadStates.length}条道路, ${physical.ferryStates.length}条渡轮, ${physicalRealityData.weatherWindows.length}个天气区域`);
                }
            }
            catch (error) {
                this.logger.warn(`检索Physical Reality数据失败: ${error instanceof Error ? error.message : String(error)}`, error);
            }
        }
        if (routeDirection.constraints) {
            const constraints = routeDirection.constraints;
            if (constraints.hard) {
                if (constraints.hard.requiresPermit) {
                    const exists = physical.roadStates.some((r) => r.roadId === 'permit-required');
                    if (!exists) {
                        physical.roadStates.push({
                            roadId: 'permit-required',
                            status: 'RESTRICTED',
                            requires4x4: constraints.hard.requires4x4 || false,
                        });
                    }
                }
            }
        }
        if (routeDirection.riskProfile) {
            const riskProfile = routeDirection.riskProfile;
            if (riskProfile.roadClosure) {
                const exists = physical.roadStates.some((r) => r.roadId === 'seasonal-closure');
                if (!exists) {
                    physical.roadStates.push({
                        roadId: 'seasonal-closure',
                        status: 'SEASONAL',
                        seasonOpenFrom: ((_b = riskProfile.weatherWindowMonths) === null || _b === void 0 ? void 0 : _b[0]) || 6,
                        seasonOpenTo: ((_c = riskProfile.weatherWindowMonths) === null || _c === void 0 ? void 0 : _c[riskProfile.weatherWindowMonths.length - 1]) || 9,
                    });
                }
            }
        }
        return physical;
    }
    identifyRegionFromCountryCode(countryCode, routeDirection) {
        const countryToRegion = {
            IS: 'iceland',
            GL: 'greenland',
            SJ: 'svalbard',
            FO: 'faroe-islands',
            AR: 'argentina',
            NO: 'lofoten',
            NZ: 'new-zealand-south-island',
            CH: 'alps',
            AT: 'alps',
            IT: 'alps',
            FR: 'alps',
            DE: 'alps',
        };
        return countryToRegion[countryCode] || 'unknown';
    }
    extractRouteCoordinates(routeDirection) {
        return null;
    }
    calculateAccessibilityScoreFromRiskLevel(riskLevel) {
        const riskToScore = {
            low: 0.9,
            medium: 0.7,
            high: 0.5,
            very_high: 0.3,
            extreme: 0.1,
        };
        return riskToScore[riskLevel] || 0.5;
    }
    buildComplianceEvidence(routeDirection) {
        const evidence = [];
        if (routeDirection.constraints) {
            const constraints = routeDirection.constraints;
            if (constraints.hard) {
                evidence.push({
                    requiresPermit: constraints.hard.requiresPermit || false,
                    requiresGuide: constraints.hard.requiresGuide || false,
                    valid: true,
                    violation: 'NONE',
                });
            }
        }
        return evidence;
    }
    async buildInitialPlan(input) {
        this.logger.debug('构建初始计划');
        if (!this.routeDirectionsService) {
            throw new tripnara_core_tool_interface_1.TripNaraCoreToolError('RouteDirectionsService 未注入，无法构建初始计划', 'EXECUTION_FAILED');
        }
        const routeDirection = await this.getRouteDirection(input);
        const tripId = `trip-${Date.now()}`;
        const routeDirectionId = routeDirection.uuid || String(routeDirection.id) || input.routeDirectionId;
        let estimatedDays = 7;
        if (routeDirection.itinerarySkeleton) {
            const skeleton = routeDirection.itinerarySkeleton;
            if (skeleton.dayThemes && Array.isArray(skeleton.dayThemes)) {
                estimatedDays = skeleton.dayThemes.length;
            }
        }
        const segments = Array.from({ length: estimatedDays }, (_, index) => ({
            segmentId: `day-${index + 1}`,
            dayIndex: index,
            distanceKm: 100,
            ascentM: 0,
            slopePct: 0,
            metadata: {
                isPlaceholder: true,
                note: '这是初始占位计划，需要由决策引擎填充实际数据',
            },
        }));
        return {
            tripId,
            routeDirectionId,
            segments,
        };
    }
    convertToToolOutput(result, input) {
        var _a;
        const explanation = this.generateExplanation(result, input);
        return {
            allowed: result.allowed,
            plan: result.plan,
            action: result.finalAction,
            logs: result.logs.map((log) => ({
                persona: log.persona,
                action: log.action,
                explanation: log.explanation,
                decisionSource: log.decisionSource,
            })),
            explanation,
            metadata: {
                ...input.metadata,
                tripId: (_a = result.plan) === null || _a === void 0 ? void 0 : _a.tripId,
            },
        };
    }
    generateExplanation(result, input) {
        if (!result.allowed) {
            const rejectReason = result.logs.find((log) => log.action === 'REJECT');
            return rejectReason
                ? `路线被拒绝：${rejectReason.explanation}`
                : '路线被拒绝：未知原因';
        }
        const parts = [];
        const abuLogs = result.logs.filter((log) => log.persona === 'ABU');
        if (abuLogs.length > 0) {
            parts.push(`安全评估（Abu）：${abuLogs[0].explanation}`);
        }
        const dreLogs = result.logs.filter((log) => log.persona === 'DR_DRE');
        if (dreLogs.some((log) => log.action === 'ADJUST')) {
            const adjustLog = dreLogs.find((log) => log.action === 'ADJUST');
            parts.push(`节奏调整（Dr.Dre）：${(adjustLog === null || adjustLog === void 0 ? void 0 : adjustLog.explanation) || '已调整行程节奏'}`);
        }
        const nepLogs = result.logs.filter((log) => log.persona === 'NEPTUNE');
        if (nepLogs.some((log) => log.action === 'REPLACE')) {
            const replaceLog = nepLogs.find((log) => log.action === 'REPLACE');
            parts.push(`空间修复（Neptune）：${(replaceLog === null || replaceLog === void 0 ? void 0 : replaceLog.explanation) || '已替换不可用路段'}`);
        }
        return parts.length > 0 ? parts.join('\n') : '路线已通过所有检查';
    }
};
exports.TripNaraCoreToolService = TripNaraCoreToolService;
exports.TripNaraCoreToolService = TripNaraCoreToolService = TripNaraCoreToolService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [strategy_orchestrator_service_1.StrategyOrchestratorService,
        route_directions_service_1.RouteDirectionsService,
        dem_decision_evidence_pipeline_service_1.DemDecisionEvidencePipelineService,
        physical_reality_retrieval_service_1.PhysicalRealityRetrievalService])
], TripNaraCoreToolService);
//# sourceMappingURL=tripnara-core-tool.service.js.map