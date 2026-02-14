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
var NeptuneStrategy_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NeptuneStrategy = void 0;
const common_1 = require("@nestjs/common");
const spatial_replacement_service_1 = require("../services/spatial-replacement.service");
const spatial_issue_detector_service_1 = require("../services/spatial-issue-detector.service");
const route_directions_service_1 = require("../../../route-directions/route-directions.service");
const route_philosophy_model_1 = require("../models/route-philosophy.model");
const exa_integration_service_1 = require("../../../mcp/exa-integration.service");
const airbnb_integration_service_1 = require("../../../mcp/airbnb-integration.service");
const booking_com_integration_service_1 = require("../../../mcp/booking-com-integration.service");
let NeptuneStrategy = NeptuneStrategy_1 = class NeptuneStrategy {
    constructor(spatialReplacement, spatialIssueDetector, routeDirectionsService, exaIntegration, airbnbIntegration, bookingComIntegration) {
        this.spatialReplacement = spatialReplacement;
        this.spatialIssueDetector = spatialIssueDetector;
        this.routeDirectionsService = routeDirectionsService;
        this.exaIntegration = exaIntegration;
        this.airbnbIntegration = airbnbIntegration;
        this.bookingComIntegration = bookingComIntegration;
        this.logger = new common_1.Logger(NeptuneStrategy_1.name);
        this.personaName = 'NEPTUNE';
    }
    async evaluate(world, plan) {
        var _a, _b;
        this.logger.debug(`Neptune 评估计划: ${plan.tripId}`);
        const detectedIssues = await this.spatialIssueDetector.detect(world, plan);
        const additionalIssues = await this.detectAdditionalSpatialIssues(world, plan);
        const spatialIssues = [...detectedIssues, ...additionalIssues];
        if (spatialIssues.length === 0) {
            return {
                allowed: true,
                action: 'ALLOW',
                updatedPlan: plan,
                logs: [
                    {
                        persona: 'NEPTUNE',
                        action: 'ALLOW',
                        explanation: '未发现空间层面的阻断或封闭问题',
                        reasonCodes: [],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'SPATIAL_REPAIR',
                    },
                ],
            };
        }
        const routeDirection = await this.getRouteDirection(plan.routeDirectionId);
        if (!routeDirection) {
            this.logger.warn(`无法获取 RouteDirection: ${plan.routeDirectionId}`);
            return {
                allowed: true,
                action: 'ALLOW',
                updatedPlan: plan,
                logs: [
                    {
                        persona: 'NEPTUNE',
                        action: 'ALLOW',
                        explanation: '无法获取路线方向信息，跳过空间修复',
                        reasonCodes: ['MISSING_ROUTE_DIRECTION'],
                        evidenceRefs: [],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'HEURISTIC',
                        decisionStage: 'SPATIAL_REPAIR',
                    },
                ],
            };
        }
        const philosophy = this.extractRoutePhilosophy(routeDirection);
        let currentPlan = { ...plan, segments: [...plan.segments] };
        const logs = [];
        let hasReplacement = false;
        for (const issue of spatialIssues) {
            const operation = await this.handleIssue(issue, world, currentPlan, routeDirection);
            if (!operation) {
                const exaAlternative = await this.searchExaAlternatives(issue, world, routeDirection);
                if (exaAlternative) {
                    logs.push({
                        persona: 'NEPTUNE',
                        action: 'REPLACE',
                        explanation: `发现 ${issue.type}（${issue.reason}），通过实时信息搜索找到替代方案: ${exaAlternative.explanation}`,
                        reasonCodes: ['EXA_ALTERNATIVE_FOUND'],
                        evidenceRefs: [issue.issueId, exaAlternative.newPoiId || ''],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHYSICAL',
                        decisionStage: 'SPATIAL_REPAIR',
                    });
                    continue;
                }
                if (issue.type === 'POI_UNAVAILABLE' && issue.poiId && issue.originalLocation) {
                    const airbnbAlternative = await this.searchAirbnbAlternatives(issue, world, plan);
                    if (airbnbAlternative) {
                        logs.push({
                            persona: 'NEPTUNE',
                            action: 'REPLACE',
                            explanation: `发现 ${issue.type}（${issue.reason}），通过 Airbnb 搜索找到路线内的替代住宿: ${airbnbAlternative.explanation}`,
                            reasonCodes: ['AIRBNB_ALTERNATIVE_FOUND'],
                            evidenceRefs: [issue.issueId, airbnbAlternative.newPoiId || ''],
                            timestamp: new Date().toISOString(),
                            decisionSource: 'HEURISTIC',
                            decisionStage: 'SPATIAL_REPAIR',
                        });
                        continue;
                    }
                }
                if (issue.type === 'POI_UNAVAILABLE' &&
                    issue.originalLocation &&
                    (((_a = issue.reason) === null || _a === void 0 ? void 0 : _a.includes('transport')) || ((_b = issue.reason) === null || _b === void 0 ? void 0 : _b.includes('交通')))) {
                    const carRentalAlternative = await this.searchCarRentalAlternatives(issue, world, plan);
                    if (carRentalAlternative) {
                        logs.push({
                            persona: 'NEPTUNE',
                            action: 'REPLACE',
                            explanation: `发现 ${issue.type}（${issue.reason}），通过 Booking.com 搜索找到租车替代方案: ${carRentalAlternative.explanation}`,
                            reasonCodes: ['BOOKING_COM_CAR_RENTAL_FOUND'],
                            evidenceRefs: [issue.issueId, carRentalAlternative.newPoiId || ''],
                            timestamp: new Date().toISOString(),
                            decisionSource: 'HEURISTIC',
                            decisionStage: 'SPATIAL_REPAIR',
                        });
                        continue;
                    }
                }
                logs.push({
                    persona: 'NEPTUNE',
                    action: 'ALLOW',
                    explanation: `发现 ${issue.type}（${issue.reason}），但在保持路线哲学的前提下未找到合理替代，将保留原结构交由上层处理`,
                    reasonCodes: ['NO_SUITABLE_REPLACEMENT'],
                    evidenceRefs: [issue.issueId],
                    timestamp: new Date().toISOString(),
                    decisionSource: 'PHILOSOPHY',
                    decisionStage: 'SPATIAL_REPAIR',
                });
                continue;
            }
            if (philosophy) {
                const validation = (0, route_philosophy_model_1.validateReplacementAgainstPhilosophy)({
                    type: operation.type,
                    originalPoiId: operation.originalPoiId,
                    newPoiId: operation.newPoiId,
                    originalSegmentId: operation.originalSegmentId,
                    newSegmentIds: operation.newSegmentIds,
                    removedTags: [],
                    addedTags: [],
                }, philosophy);
                if (!validation.allowed) {
                    this.logger.warn(`替换操作违反路线哲学: ${validation.violations.join('; ')}`);
                    logs.push({
                        persona: 'NEPTUNE',
                        action: 'ALLOW',
                        explanation: `替换操作违反路线哲学（${validation.violations.join('; ')}），拒绝替换`,
                        reasonCodes: ['PHILOSOPHY_VIOLATION'],
                        evidenceRefs: [issue.issueId],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHILOSOPHY',
                        decisionStage: 'SPATIAL_REPAIR',
                    });
                    continue;
                }
            }
            const planBefore = currentPlan;
            currentPlan = this.applyReplacement(currentPlan, operation);
            if (philosophy) {
                const currentTags = routeDirection.tags || [];
                const coverage = (0, route_philosophy_model_1.checkCoreExperienceCoverage)(currentTags, philosophy);
                if (!coverage.covered) {
                    this.logger.warn(`替换后核心体验缺失: ${coverage.missingTags.join(', ')}`);
                    currentPlan = planBefore;
                    logs.push({
                        persona: 'NEPTUNE',
                        action: 'ALLOW',
                        explanation: `替换后核心体验缺失（${coverage.missingTags.join(', ')}），拒绝替换`,
                        reasonCodes: ['CORE_EXPERIENCE_MISSING'],
                        evidenceRefs: [issue.issueId],
                        timestamp: new Date().toISOString(),
                        decisionSource: 'PHILOSOPHY',
                        decisionStage: 'SPATIAL_REPAIR',
                    });
                    continue;
                }
            }
            hasReplacement = true;
            logs.push({
                persona: 'NEPTUNE',
                action: 'REPLACE',
                explanation: operation.explanation,
                reasonCodes: [issue.type, 'SPATIAL_REPLACEMENT'],
                evidenceRefs: [issue.issueId],
                timestamp: new Date().toISOString(),
                decisionSource: 'PHYSICAL',
                decisionStage: 'SPATIAL_REPAIR',
            });
        }
        const action = hasReplacement ? 'REPLACE' : 'ALLOW';
        this.logger.debug(`Neptune 评估完成: ${action}, 替换数: ${hasReplacement ? logs.filter(l => l.action === 'REPLACE').length : 0}`);
        return {
            allowed: true,
            action,
            updatedPlan: hasReplacement ? currentPlan : undefined,
            logs,
        };
    }
    async detectAdditionalSpatialIssues(world, plan) {
        var _a;
        const issues = [];
        if (world.physical.climateSeasonality) {
            const climate = world.physical.climateSeasonality;
            if (climate.typicalWeather &&
                (climate.typicalWeather.windSpeedMps > 15 ||
                    climate.typicalWeather.visibilityMeters < 100)) {
                for (const segment of plan.segments) {
                    issues.push({
                        issueId: `weather_${segment.segmentId}_${Date.now()}`,
                        type: 'SEGMENT_BLOCKED',
                        segmentId: segment.segmentId,
                        severity: 'HARD',
                        reason: `天气条件不符合安全要求（风速 ${climate.typicalWeather.windSpeedMps.toFixed(1)} m/s，能见度 ${climate.typicalWeather.visibilityMeters.toFixed(0)}m）`,
                        originalLocation: ((_a = segment.metadata) === null || _a === void 0 ? void 0 : _a.location)
                            ? {
                                lat: segment.metadata.location.lat,
                                lng: segment.metadata.location.lng,
                            }
                            : undefined,
                        metadata: {
                            windSpeedMps: climate.typicalWeather.windSpeedMps,
                            visibilityMeters: climate.typicalWeather.visibilityMeters,
                            precipitationMmPerHour: climate.typicalWeather.precipitationMmPerHour,
                        },
                    });
                    break;
                }
            }
        }
        if (world.complianceEvidence) {
            for (const compliance of world.complianceEvidence) {
                if (compliance.violation === 'HARD' && !compliance.valid) {
                    if (compliance.requiresPermit && !compliance.valid) {
                        issues.push({
                            issueId: `compliance_permit_${Date.now()}`,
                            type: 'SEGMENT_BLOCKED',
                            severity: 'HARD',
                            reason: '需要许可但未获得',
                            metadata: {
                                requiresPermit: compliance.requiresPermit,
                                requiresGuide: compliance.requiresGuide,
                            },
                        });
                    }
                }
            }
        }
        return issues;
    }
    extractRoutePhilosophy(routeDirection) {
        if (!routeDirection) {
            return null;
        }
        if (routeDirection.philosophy && typeof routeDirection.philosophy === 'object') {
            return routeDirection.philosophy;
        }
        if (routeDirection.philosophy && typeof routeDirection.philosophy === 'string') {
            this.logger.debug(`路线哲学是字符串格式，暂不支持解析: ${routeDirection.philosophy}`);
            return null;
        }
        return null;
    }
    async handleIssue(issue, world, plan, routeDirection) {
        const spatialConstraintValid = this.validateSpatialConstraint(issue, world.physical, routeDirection);
        if (!spatialConstraintValid) {
            this.logger.warn(`空间问题 ${issue.issueId} 的替代方案不在路线走廊或区域内，拒绝替换`);
            return null;
        }
        const input = {
            world,
            plan,
            spatialIssues: [issue],
            routeDirection,
        };
        switch (issue.type) {
            case 'ENTRY_UNREACHABLE':
                return this.spatialReplacement.replaceEntry(issue, input);
            case 'POI_UNAVAILABLE': {
                const segment = plan.segments.find(s => s.segmentId === issue.segmentId);
                const dayIndex = (segment === null || segment === void 0 ? void 0 : segment.dayIndex) || 1;
                return this.spatialReplacement.replacePoi(issue, input, dayIndex);
            }
            case 'SEGMENT_BLOCKED':
            case 'HAZARD_ZONE':
                return this.spatialReplacement.replaceSegmentCorridor(issue, input);
            default:
                return null;
        }
    }
    async searchExaAlternatives(issue, world, routeDirection) {
        if (!this.exaIntegration) {
            return null;
        }
        try {
            const destination = issue.originalLocation
                ? `${issue.originalLocation.lat},${issue.originalLocation.lng}`
                : world.physical.countryCode;
            const category = issue.type === 'POI_UNAVAILABLE' ? '景点' : '入口点';
            const month = world.physical.month;
            const alternatives = await this.exaIntegration.searchAlternativeDestinations(destination, category, month, new Date().getFullYear());
            if (alternatives.alternatives.length === 0) {
                return null;
            }
            const alternative = alternatives.alternatives[0];
            return {
                type: issue.type === 'POI_UNAVAILABLE' ? 'POI_REPLACEMENT' : 'ENTRY_REPLACEMENT',
                originalPoiId: issue.poiId || '',
                newPoiId: `exa_${Date.now()}`,
                score: 0.5,
                explanation: `通过实时信息搜索找到替代方案: ${alternative.name}${alternative.description ? ` - ${alternative.description}` : ''}`,
            };
        }
        catch (error) {
            this.logger.warn(`Exa alternative search failed: ${error.message}`);
            return null;
        }
    }
    async searchCarRentalAlternatives(issue, world, plan) {
        var _a, _b, _c;
        if (!this.bookingComIntegration || !issue.originalLocation) {
            return null;
        }
        try {
            const currentYear = new Date().getFullYear();
            const month = world.physical.month;
            const dayDate = new Date(currentYear, month - 1, 1);
            const pickupTime = '10:00';
            const dropoffTime = '18:00';
            const driverAge = ((_a = world.human) === null || _a === void 0 ? void 0 : _a.driverAge) || 25;
            const availability = await this.bookingComIntegration.searchCarRentalsInCorridor(issue.originalLocation, 5, pickupTime, dropoffTime, driverAge);
            if (!availability.available || !availability.rentals || availability.rentals.length === 0) {
                return null;
            }
            const cheapest = availability.rentals.reduce((prev, curr) => {
                var _a, _b;
                const prevPrice = ((_a = prev.price) === null || _a === void 0 ? void 0 : _a.amount) || Infinity;
                const currPrice = ((_b = curr.price) === null || _b === void 0 ? void 0 : _b.amount) || Infinity;
                return currPrice < prevPrice ? curr : prev;
            });
            return {
                type: 'POI_REPLACEMENT',
                originalPoiId: issue.poiId || '',
                newPoiId: cheapest.id,
                score: 0.7,
                explanation: `找到路线内的租车替代方案: ${cheapest.company} - ${cheapest.vehicleType}（价格 ${(_b = cheapest.price) === null || _b === void 0 ? void 0 : _b.currency} ${(_c = cheapest.price) === null || _c === void 0 ? void 0 : _c.amount}）`,
            };
        }
        catch (error) {
            this.logger.warn(`Booking.com car rental search failed: ${error.message}`);
            return null;
        }
    }
    async searchAirbnbAlternatives(issue, world, plan) {
        var _a;
        if (!this.airbnbIntegration || !issue.originalLocation) {
            return null;
        }
        try {
            const currentYear = new Date().getFullYear();
            const month = world.physical.month;
            const dayDate = new Date(currentYear, month - 1, 1);
            const checkinDate = dayDate.toISOString().split('T')[0];
            const checkoutDate = new Date(dayDate.getTime() + 86400000).toISOString().split('T')[0];
            const partySize = ((_a = world.human) === null || _a === void 0 ? void 0 : _a.partySize) || 2;
            const availability = await this.airbnbIntegration.searchAccommodationsInCorridor(issue.originalLocation, 5, checkinDate, checkoutDate, partySize);
            if (!availability.available || !availability.listings || availability.listings.length === 0) {
                return null;
            }
            const nearest = availability.listings.reduce((prev, curr) => {
                const prevDist = prev.distanceFromPoint || Infinity;
                const currDist = curr.distanceFromPoint || Infinity;
                return currDist < prevDist ? curr : prev;
            });
            return {
                type: 'POI_REPLACEMENT',
                originalPoiId: issue.poiId || '',
                newPoiId: nearest.id,
                score: 0.6,
                explanation: `找到路线内的替代住宿: ${nearest.name}（距离 ${(nearest.distanceFromPoint || 0 / 1000).toFixed(1)}km）`,
            };
        }
        catch (error) {
            this.logger.warn(`Airbnb alternative search failed: ${error.message}`);
            return null;
        }
    }
    applyReplacement(plan, operation) {
        var _a;
        const updated = { ...plan, segments: [...plan.segments] };
        switch (operation.type) {
            case 'ENTRY_REPLACEMENT':
            case 'POI_REPLACEMENT': {
                if (operation.originalPoiId && operation.newPoiId) {
                    for (const segment of updated.segments) {
                        if (((_a = segment.metadata) === null || _a === void 0 ? void 0 : _a.poiId) === operation.originalPoiId) {
                            segment.metadata = {
                                ...segment.metadata,
                                poiId: operation.newPoiId,
                                replaced: true,
                                replacementReason: operation.explanation,
                            };
                        }
                    }
                }
                break;
            }
            case 'SEGMENT_REPLACEMENT': {
                if (operation.originalSegmentId && operation.newSegmentIds) {
                    const segmentIndex = updated.segments.findIndex(s => s.segmentId === operation.originalSegmentId);
                    if (segmentIndex >= 0) {
                        updated.segments.splice(segmentIndex, 1);
                    }
                }
                break;
            }
        }
        return updated;
    }
    validateSpatialConstraint(issue, physical, routeDirection) {
        if (issue.originalLocation && routeDirection.regions) {
            return true;
        }
        return true;
    }
    async getRouteDirection(routeDirectionId) {
        var _a;
        if (!this.routeDirectionsService) {
            this.logger.warn('RouteDirectionsService 未注入，返回默认值');
            return {
                id: routeDirectionId,
                corridorGeom: undefined,
                regions: [],
                philosophy: '',
                metadata: {},
            };
        }
        try {
            const id = parseInt(routeDirectionId, 10);
            if (!isNaN(id)) {
                const rd = await this.routeDirectionsService.findRouteDirectionById(id);
                if (rd) {
                    return {
                        id: rd.id,
                        uuid: rd.uuid,
                        corridorGeom: rd.corridorGeom,
                        regions: rd.regions || [],
                        philosophy: ((_a = rd.metadata) === null || _a === void 0 ? void 0 : _a.philosophy) || '',
                        metadata: rd.metadata || {},
                    };
                }
            }
            this.logger.warn(`无法解析 RouteDirection ID: ${routeDirectionId}`);
            return {
                id: routeDirectionId,
                corridorGeom: undefined,
                regions: [],
                philosophy: '',
                metadata: {},
            };
        }
        catch (error) {
            this.logger.error(`获取 RouteDirection 失败: ${error}`);
            return {
                id: routeDirectionId,
                corridorGeom: undefined,
                regions: [],
                philosophy: '',
                metadata: {},
            };
        }
    }
};
exports.NeptuneStrategy = NeptuneStrategy;
exports.NeptuneStrategy = NeptuneStrategy = NeptuneStrategy_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [spatial_replacement_service_1.SpatialReplacementService,
        spatial_issue_detector_service_1.SpatialIssueDetectorService,
        route_directions_service_1.RouteDirectionsService,
        exa_integration_service_1.ExaIntegrationService,
        airbnb_integration_service_1.AirbnbIntegrationService,
        booking_com_integration_service_1.BookingComIntegrationService])
], NeptuneStrategy);
//# sourceMappingURL=neptune-strategy.service.js.map