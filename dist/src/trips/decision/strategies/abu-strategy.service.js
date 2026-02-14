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
var AbuStrategy_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbuStrategy = void 0;
const common_1 = require("@nestjs/common");
const physical_reality_model_1 = require("../models/physical-reality.model");
const exa_integration_service_1 = require("../../../mcp/exa-integration.service");
const airbnb_integration_service_1 = require("../../../mcp/airbnb-integration.service");
const booking_com_integration_service_1 = require("../../../mcp/booking-com-integration.service");
let AbuStrategy = AbuStrategy_1 = class AbuStrategy {
    constructor(exaIntegration, airbnbIntegration, bookingComIntegration) {
        this.exaIntegration = exaIntegration;
        this.airbnbIntegration = airbnbIntegration;
        this.bookingComIntegration = bookingComIntegration;
        this.logger = new common_1.Logger(AbuStrategy_1.name);
        this.personaName = 'ABU';
    }
    async evaluate(world, plan) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        if (!world) {
            this.logger.error('WorldModelContext 不能为空');
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: 'WorldModelContext 不能为空',
                        reasonCodes: ['MISSING_WORLD_CONTEXT'],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'ABU_GATE',
                    },
                ],
            };
        }
        if (!plan) {
            this.logger.error('RoutePlanDraft 不能为空');
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: 'RoutePlanDraft 不能为空',
                        reasonCodes: ['MISSING_PLAN'],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'ABU_GATE',
                    },
                ],
            };
        }
        this.logger.debug(`Abu 评估计划: ${plan.tripId || 'unknown'}`);
        if (!world.physical) {
            this.logger.error('WorldModelContext.physical 不能为空');
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: 'WorldModelContext.physical 不能为空',
                        reasonCodes: ['MISSING_PHYSICAL_MODEL'],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'ABU_GATE',
                    },
                ],
            };
        }
        const physical = world.physical;
        const complianceEvidence = world.complianceEvidence || [];
        const validation = (0, physical_reality_model_1.validatePhysicalRealityModel)(physical);
        if (!validation.valid) {
            this.logger.warn(`计划 ${plan.tripId} 的 PhysicalRealityModel 不完整，缺少: ${validation.missingFields.join(', ')}`);
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: `物理现实模型不完整，缺少字段: ${validation.missingFields.join(', ')}`,
                        reasonCodes: ['INCOMPLETE_PHYSICAL_REALITY'],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'ABU_GATE',
                    },
                ],
            };
        }
        const demHardViolation = physical.demEvidence.find(e => e.violation === 'HARD' && !e.segmentId.includes('placeholder'));
        if (demHardViolation) {
            this.logger.warn(`计划 ${plan.tripId} 存在 DEM 硬违规: ${demHardViolation.segmentId}`);
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: `检测到 DEM 硬违规（路段: ${demHardViolation.segmentId}，原因: ${demHardViolation.explanation || '未知'}），路线不应继续`,
                        reasonCodes: ['HARD_DEM_VIOLATION'],
                        evidenceRefs: [demHardViolation.segmentId],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'ABU_GATE',
                    },
                ],
            };
        }
        const closedRoads = physical.roadStates.filter(road => road.status === 'CLOSED' ||
            (road.status === 'SEASONAL' &&
                (road.seasonOpenFrom && physical.month < road.seasonOpenFrom ||
                    road.seasonOpenTo && physical.month > road.seasonOpenTo)));
        let realTimeRiskInfo = null;
        if (this.exaIntegration && world.routeDirection) {
            try {
                const routeName = world.routeDirection.name || plan.routeDirectionId;
                realTimeRiskInfo = await this.exaIntegration.searchRealTimeRisks(physical.countryCode, routeName, physical.month, new Date().getFullYear());
                if (realTimeRiskInfo.hasRisk) {
                    this.logger.warn(`计划 ${plan.tripId} 检测到实时风险: ${realTimeRiskInfo.riskType} - ${realTimeRiskInfo.riskDescription}`);
                    if (realTimeRiskInfo.riskType === 'ROAD_CLOSED' || realTimeRiskInfo.riskType === 'TRANSPORT') {
                        return {
                            allowed: false,
                            action: 'REJECT',
                            logs: [
                                {
                                    persona: 'ABU',
                                    action: 'REJECT',
                                    explanation: `实时信息显示路线封闭或交通中断: ${realTimeRiskInfo.riskDescription || '未知原因'}`,
                                    reasonCodes: ['REALTIME_ROAD_CLOSED'],
                                    evidenceRefs: [],
                                    timestamp: new Date().toISOString(),
                                    decisionSource: 'PHYSICAL',
                                    decisionStage: 'ABU_GATE',
                                },
                            ],
                        };
                    }
                    if (realTimeRiskInfo.riskType === 'WEATHER' ||
                        realTimeRiskInfo.riskType === 'GEOLOGICAL' ||
                        realTimeRiskInfo.riskType === 'POLITICAL') {
                        return {
                            allowed: false,
                            action: 'REJECT',
                            logs: [
                                {
                                    persona: 'ABU',
                                    action: 'REJECT',
                                    explanation: `实时信息显示高风险: ${realTimeRiskInfo.riskType} - ${realTimeRiskInfo.riskDescription || '未知原因'}`,
                                    reasonCodes: ['REALTIME_HIGH_RISK'],
                                    evidenceRefs: [],
                                    timestamp: new Date().toISOString(),
                                    decisionSource: 'PHYSICAL',
                                    decisionStage: 'ABU_GATE',
                                },
                            ],
                        };
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Exa real-time risk search failed: ${error.message}, continuing with structured data`);
            }
        }
        if (closedRoads.length > 0) {
            this.logger.warn(`计划 ${plan.tripId} 包含 ${closedRoads.length} 条封闭道路`);
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: `检测到封闭道路: ${closedRoads.map(r => r.roadId).join(', ')}，路线不应继续`,
                        reasonCodes: ['ROAD_CLOSED'],
                        evidenceRefs: closedRoads.map(r => r.roadId),
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'ABU_GATE',
                    },
                ],
            };
        }
        const highRiskHazards = physical.hazardZones.filter(hazard => {
            var _a, _b, _c;
            return hazard.level === 'HIGH' &&
                ((_c = (_b = (_a = hazard.seasonality) === null || _a === void 0 ? void 0 : _a.highRiskMonths) === null || _b === void 0 ? void 0 : _b.includes(physical.month)) !== null && _c !== void 0 ? _c : false);
        });
        if (highRiskHazards.length > 0) {
            this.logger.warn(`计划 ${plan.tripId} 包含 ${highRiskHazards.length} 个高风险危险区域`);
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: `检测到高风险危险区域（${highRiskHazards.map(h => `${h.type}@${h.zoneId}`).join(', ')}），路线不应继续`,
                        reasonCodes: ['HIGH_RISK_HAZARD_ZONE'],
                        evidenceRefs: highRiskHazards.map(h => h.zoneId),
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'ABU_GATE',
                    },
                ],
            };
        }
        const cancelledFerries = physical.ferryStates.filter(ferry => ferry.status === 'CANCELLED' ||
            (ferry.status === 'SEASONAL' &&
                (ferry.seasonOpenFrom && physical.month < ferry.seasonOpenFrom ||
                    ferry.seasonOpenTo && physical.month > ferry.seasonOpenTo)));
        if (cancelledFerries.length > 0) {
            this.logger.warn(`计划 ${plan.tripId} 可能依赖已取消的渡轮: ${cancelledFerries.map(f => f.ferryId).join(', ')}`);
        }
        if (this.airbnbIntegration && plan.segments.length > 0) {
            try {
                const firstSegment = plan.segments.find(s => s.dayIndex === 0 || s.dayIndex === 1) || plan.segments[0];
                const lastSegment = plan.segments[plan.segments.length - 1];
                const firstNodeLocation = ((_a = firstSegment.metadata) === null || _a === void 0 ? void 0 : _a.startLocation) ||
                    ((_b = firstSegment.metadata) === null || _b === void 0 ? void 0 : _b.fromLocation) ||
                    ((_c = firstSegment.metadata) === null || _c === void 0 ? void 0 : _c.coordinates);
                const lastNodeLocation = ((_d = lastSegment.metadata) === null || _d === void 0 ? void 0 : _d.endLocation) ||
                    ((_e = lastSegment.metadata) === null || _e === void 0 ? void 0 : _e.toLocation) ||
                    ((_f = lastSegment.metadata) === null || _f === void 0 ? void 0 : _f.coordinates);
                const currentYear = new Date().getFullYear();
                const month = physical.month;
                const firstDayDate = new Date(currentYear, month - 1, 1);
                const lastDayDate = new Date(currentYear, month - 1, plan.segments.length);
                const checkinDate = firstDayDate.toISOString().split('T')[0];
                const checkoutDate = new Date(lastDayDate.getTime() + 86400000).toISOString().split('T')[0];
                const partySize = ((_g = world.human) === null || _g === void 0 ? void 0 : _g.partySize) || 2;
                if (firstNodeLocation && firstNodeLocation.lat && firstNodeLocation.lng) {
                    const firstDayAvailability = await this.airbnbIntegration.checkCriticalNodeAvailability({ lat: firstNodeLocation.lat, lng: firstNodeLocation.lng }, checkinDate, new Date(firstDayDate.getTime() + 86400000).toISOString().split('T')[0], partySize);
                    if (!firstDayAvailability.available) {
                        this.logger.warn(`计划 ${plan.tripId} 第一天起点没有可用住宿`);
                        return {
                            allowed: false,
                            action: 'REJECT',
                            logs: [
                                {
                                    persona: 'ABU',
                                    action: 'REJECT',
                                    explanation: `第一天起点没有可用住宿，路线不可执行`,
                                    reasonCodes: ['NO_ACCOMMODATION_AT_START'],
                                    evidenceRefs: [firstSegment.segmentId],
                                    timestamp: new Date().toISOString(),
                                    decisionSource: 'HEURISTIC',
                                    decisionStage: 'ABU_GATE',
                                },
                            ],
                        };
                    }
                }
                if (lastNodeLocation && lastNodeLocation.lat && lastNodeLocation.lng) {
                    const lastDayCheckin = new Date(lastDayDate.getTime() - 86400000).toISOString().split('T')[0];
                    const lastDayAvailability = await this.airbnbIntegration.checkCriticalNodeAvailability({ lat: lastNodeLocation.lat, lng: lastNodeLocation.lng }, lastDayCheckin, checkoutDate, partySize);
                    if (!lastDayAvailability.available) {
                        this.logger.warn(`计划 ${plan.tripId} 最后一天终点没有可用住宿`);
                        return {
                            allowed: false,
                            action: 'REJECT',
                            logs: [
                                {
                                    persona: 'ABU',
                                    action: 'REJECT',
                                    explanation: `最后一天终点没有可用住宿，路线不可执行`,
                                    reasonCodes: ['NO_ACCOMMODATION_AT_END'],
                                    evidenceRefs: [lastSegment.segmentId],
                                    timestamp: new Date().toISOString(),
                                    decisionSource: 'HEURISTIC',
                                    decisionStage: 'ABU_GATE',
                                },
                            ],
                        };
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Airbnb accommodation check failed: ${error.message}, continuing with other checks`);
            }
        }
        if (this.bookingComIntegration && plan.segments.length > 0) {
            try {
                const routeTags = ((_h = world.routeDirection) === null || _h === void 0 ? void 0 : _h.tags) || [];
                const needsCarRental = routeTags.includes('road-trip') ||
                    routeTags.includes('self-drive') ||
                    ((_k = (_j = world.routeDirection) === null || _j === void 0 ? void 0 : _j.metadata) === null || _k === void 0 ? void 0 : _k.needsCarRental) === true;
                if (!needsCarRental) {
                    this.logger.debug('Route does not require car rental, skipping check');
                }
                else {
                    const firstSegment = plan.segments.find(s => s.dayIndex === 0 || s.dayIndex === 1) || plan.segments[0];
                    const lastSegment = plan.segments[plan.segments.length - 1];
                    const firstNodeLocation = ((_l = firstSegment.metadata) === null || _l === void 0 ? void 0 : _l.startLocation) ||
                        ((_m = firstSegment.metadata) === null || _m === void 0 ? void 0 : _m.fromLocation) ||
                        ((_o = firstSegment.metadata) === null || _o === void 0 ? void 0 : _o.coordinates);
                    const lastNodeLocation = ((_p = lastSegment.metadata) === null || _p === void 0 ? void 0 : _p.endLocation) ||
                        ((_q = lastSegment.metadata) === null || _q === void 0 ? void 0 : _q.toLocation) ||
                        ((_r = lastSegment.metadata) === null || _r === void 0 ? void 0 : _r.coordinates);
                    if (firstNodeLocation && lastNodeLocation &&
                        firstNodeLocation.lat && firstNodeLocation.lng &&
                        lastNodeLocation.lat && lastNodeLocation.lng) {
                        const currentYear = new Date().getFullYear();
                        const month = physical.month;
                        const firstDayDate = new Date(currentYear, month - 1, 1);
                        const lastDayDate = new Date(currentYear, month - 1, plan.segments.length);
                        const pickupTime = '10:00';
                        const dropoffTime = '10:00';
                        const driverAge = ((_s = world.human) === null || _s === void 0 ? void 0 : _s.driverAge) || 25;
                        const carRentalAvailability = await this.bookingComIntegration.checkCriticalNodeCarRentalAvailability({ lat: firstNodeLocation.lat, lng: firstNodeLocation.lng }, { lat: lastNodeLocation.lat, lng: lastNodeLocation.lng }, pickupTime, dropoffTime, driverAge);
                        if (!carRentalAvailability.available) {
                            this.logger.warn(`计划 ${plan.tripId} 关键节点没有可用租车（路线需要租车）`);
                            return {
                                allowed: false,
                                action: 'REJECT',
                                logs: [
                                    {
                                        persona: 'ABU',
                                        action: 'REJECT',
                                        explanation: `路线需要租车，但关键节点没有可用租车，路线不可执行`,
                                        reasonCodes: ['NO_CAR_RENTAL_AVAILABLE'],
                                        evidenceRefs: [firstSegment.segmentId, lastSegment.segmentId],
                                        timestamp: new Date().toISOString(),
                                        decisionSource: 'HEURISTIC',
                                        decisionStage: 'ABU_GATE',
                                    },
                                ],
                            };
                        }
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Booking.com car rental check failed: ${error.message}, continuing with other checks`);
            }
        }
        const complianceHardViolation = complianceEvidence.find(e => e.violation === 'HARD');
        if (complianceHardViolation) {
            this.logger.warn(`计划 ${plan.tripId} 存在合规硬违规`);
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: '检测到合规硬违规（如缺少许可或向导），路线不应继续',
                        reasonCodes: ['HARD_COMPLIANCE_VIOLATION'],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'ABU_GATE',
                    },
                ],
            };
        }
        if (physical.climateSeasonality && physical.climateSeasonality.accessibilityScore < 0.3) {
            this.logger.warn(`计划 ${plan.tripId} 在当前月份（${physical.month}）可达性评分过低: ${physical.climateSeasonality.accessibilityScore}`);
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: `当前月份（${physical.month}）可达性评分过低（${physical.climateSeasonality.accessibilityScore}），路线不应继续`,
                        reasonCodes: ['LOW_ACCESSIBILITY_SCORE'],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'ABU_GATE',
                    },
                ],
            };
        }
        if (!physical.demEvidence || physical.demEvidence.length === 0) {
            this.logger.warn(`计划 ${plan.tripId} 缺少 DEM Evidence，Abu 必须 REJECT`);
            return {
                allowed: false,
                action: 'REJECT',
                logs: [
                    {
                        persona: 'ABU',
                        action: 'REJECT',
                        explanation: '缺少 DEM Evidence（DEM 证据是必需的），路线不应继续',
                        reasonCodes: ['E_DEM_MISSING'],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'DEM_EVIDENCE',
                    },
                ],
            };
        }
        this.logger.debug(`计划 ${plan.tripId} 通过 Abu 检查，允许继续`);
        return {
            allowed: true,
            action: 'ALLOW',
            logs: [
                {
                    persona: 'ABU',
                    action: 'ALLOW',
                    explanation: '未发现硬性风险问题（DEM、道路、危险区域、合规均通过），允许继续',
                    reasonCodes: [],
                    evidenceRefs: [],
                    timestamp: new Date().toISOString(),
                    decisionSource: 'PHYSICAL',
                    decisionStage: 'ABU_GATE',
                },
            ],
        };
    }
};
exports.AbuStrategy = AbuStrategy;
exports.AbuStrategy = AbuStrategy = AbuStrategy_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [exa_integration_service_1.ExaIntegrationService,
        airbnb_integration_service_1.AirbnbIntegrationService,
        booking_com_integration_service_1.BookingComIntegrationService])
], AbuStrategy);
//# sourceMappingURL=abu-strategy.service.js.map