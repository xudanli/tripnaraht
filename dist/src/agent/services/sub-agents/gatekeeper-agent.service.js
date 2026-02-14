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
var ClaudeGatekeeperAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeGatekeeperAgentService = void 0;
const common_1 = require("@nestjs/common");
const plan_gate_run_three_guardians_skill_1 = require("../../../skills/plan/gate/plan-gate-run-three-guardians.skill");
const plan_gate_precheck_skill_1 = require("../../../skills/plan/gate/plan-gate-precheck.skill");
const f_road_check_skill_1 = require("../../../skills/world/f-road-check.skill");
const weather_alert_skill_1 = require("../../../skills/world/weather-alert.skill");
const avalanche_risk_assessment_skill_1 = require("../../../skills/world/avalanche-risk-assessment.skill");
let ClaudeGatekeeperAgentService = ClaudeGatekeeperAgentService_1 = class ClaudeGatekeeperAgentService {
    constructor(gateRunThreeGuardians, gatePrecheck, fRoadCheck, weatherAlert, avalancheRisk) {
        this.gateRunThreeGuardians = gateRunThreeGuardians;
        this.gatePrecheck = gatePrecheck;
        this.fRoadCheck = fRoadCheck;
        this.weatherAlert = weatherAlert;
        this.avalancheRisk = avalancheRisk;
        this.logger = new common_1.Logger(ClaudeGatekeeperAgentService_1.name);
        this.logger.log(`[GatekeeperAgent] 已初始化`);
        this.logger.log(`[GatekeeperAgent] GateRunThreeGuardians: ${!!this.gateRunThreeGuardians}, GatePrecheck: ${!!this.gatePrecheck}, FRoadCheck: ${!!this.fRoadCheck}, WeatherAlert: ${!!this.weatherAlert}, AvalancheRisk: ${!!this.avalancheRisk}`);
    }
    async evaluateGate(request, researchData, context) {
        var _a, _b;
        this.logger.debug(`[GatekeeperAgent] 执行 Gate 评估: request_id=${request.request_id}`);
        try {
            if (this.fRoadCheck && this.isIcelandTrip(request)) {
                this.logger.debug(`[GatekeeperAgent] 检测到冰岛行程，执行 F-Road 检查`);
                const fRoadResult = await this.fRoadCheck.execute({
                    request_id: request.request_id,
                    destination: this.toLocationString(request.destination) || '',
                    origin: this.toLocationString(request.origin),
                    date_range: request.date_range,
                });
                if (!fRoadResult.can_proceed) {
                    this.logger.warn(`[GatekeeperAgent] F-Road 检查失败: ${fRoadResult.blocked_roads.length} 条道路关闭`);
                    return {
                        gate_result: 'BLOCK',
                        violations: fRoadResult.blocked_roads.map(r => ({
                            type: 'REACHABILITY',
                            severity: 'HARD',
                            detail: `${r.roadId} is ${r.currentStatus}: ${r.reason}${r.unverified ? ' (UNVERIFIED - requires manual verification)' : ''}`,
                        })),
                        required_adjustments: (fRoadResult.alternative_routes || []).map(alt => ({
                            action: 'REPLACE_SEGMENT',
                            why: alt,
                        })),
                        confidence: 0.9,
                        evidence_refs: fRoadResult.evidence_refs.map(ref => ({
                            evidence_id: ref.evidence_id,
                            source: ref.source,
                            last_verified_at: ref.last_verified_at.toISOString(),
                            confidence: ref.confidence,
                        })),
                    };
                }
                if (fRoadResult.warnings.length > 0 || fRoadResult.required_actions.length > 0) {
                    this.logger.warn(`[GatekeeperAgent] F-Road 检查告警: ${fRoadResult.warnings.length} 条`);
                    researchData.f_road_warnings = fRoadResult.warnings;
                    researchData.f_road_required_actions = fRoadResult.required_actions;
                    researchData.f_road_evidence_refs = fRoadResult.evidence_refs;
                }
            }
            if (this.weatherAlert && this.isIcelandTrip(request)) {
                this.logger.debug(`[GatekeeperAgent] 检测到冰岛行程，执行天气告警检查`);
                const locations = [];
                if (request.origin) {
                    locations.push({
                        lat: typeof request.origin === 'string' ? 0 : request.origin.lat,
                        lng: typeof request.origin === 'string' ? 0 : request.origin.lng,
                        name: typeof request.origin === 'string' ? request.origin : '起点',
                        type: 'start',
                    });
                }
                if (request.destination) {
                    locations.push({
                        lat: typeof request.destination === 'string' ? 0 : request.destination.lat,
                        lng: typeof request.destination === 'string' ? 0 : request.destination.lng,
                        name: typeof request.destination === 'string' ? request.destination : '终点',
                        type: 'end',
                    });
                }
                let dateRange;
                if (request.date_range) {
                    if ('start' in request.date_range && 'end' in request.date_range) {
                        dateRange = request.date_range;
                    }
                    else if ('start_date' in request.date_range && 'end_date' in request.date_range) {
                        dateRange = {
                            start: new Date(request.date_range.start_date),
                            end: new Date(request.date_range.end_date),
                        };
                    }
                    else {
                        dateRange = {
                            start: new Date(),
                            end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        };
                    }
                }
                else {
                    dateRange = {
                        start: new Date(),
                        end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    };
                }
                try {
                    const weatherResult = await this.weatherAlert.execute({
                        locations: locations.length > 0 ? locations : [
                            { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' },
                            { lat: 64.75, lng: -18.0, name: 'Highlands', type: 'end' },
                        ],
                        dateRange,
                        riskTolerance: 'medium',
                    });
                    if (weatherResult.gateRecommendation === 'BLOCK') {
                        this.logger.warn(`[GatekeeperAgent] 天气检查 BLOCK: ${weatherResult.overallRisk}`);
                        return {
                            gate_result: 'BLOCK',
                            violations: weatherResult.locationWeather.flatMap(lw => lw.blockers.map(b => ({
                                type: 'SAFETY',
                                severity: 'HARD',
                                detail: `${lw.location.name}: ${b}`,
                            }))),
                            required_adjustments: weatherResult.adjustments.map(adj => ({
                                action: 'CHANGE_DATES',
                                why: adj,
                            })),
                            confidence: ((_a = weatherResult.evidenceRefs[0]) === null || _a === void 0 ? void 0 : _a.confidence) || 0.8,
                            evidence_refs: weatherResult.evidenceRefs.map(ref => ({
                                evidence_id: ref.location,
                                source: ref.source,
                                last_verified_at: ref.timestamp.toISOString(),
                                confidence: ref.confidence,
                            })),
                        };
                    }
                    researchData.weather_alert_result = weatherResult;
                    researchData.weather_gate_recommendation = weatherResult.gateRecommendation;
                    if (weatherResult.gateRecommendation === 'ADJUST_REQUIRED' ||
                        weatherResult.gateRecommendation === 'NEED_USER_CONFIRM') {
                        this.logger.warn(`[GatekeeperAgent] 天气检查告警: ${weatherResult.summary}`);
                    }
                }
                catch (weatherError) {
                    this.logger.warn(`[GatekeeperAgent] 天气检查出错 (降级处理): ${weatherError === null || weatherError === void 0 ? void 0 : weatherError.message}`);
                    researchData.weather_check_failed = true;
                    researchData.weather_check_error = weatherError === null || weatherError === void 0 ? void 0 : weatherError.message;
                }
            }
            if (this.avalancheRisk && this.isIcelandTrip(request)) {
                this.logger.debug(`[GatekeeperAgent] 检测到冰岛行程，执行雪崩风险评估`);
                try {
                    const routePoints = [];
                    if (request.origin) {
                        routePoints.push({
                            lat: typeof request.origin === 'string' ? 0 : request.origin.lat,
                            lng: typeof request.origin === 'string' ? 0 : request.origin.lng,
                            name: typeof request.origin === 'string' ? request.origin : '起点',
                        });
                    }
                    if (request.destination) {
                        routePoints.push({
                            lat: typeof request.destination === 'string' ? 0 : request.destination.lat,
                            lng: typeof request.destination === 'string' ? 0 : request.destination.lng,
                            name: typeof request.destination === 'string' ? request.destination : '终点',
                        });
                    }
                    let month = new Date().getMonth() + 1;
                    if (request.date_range) {
                        if ('start' in request.date_range && request.date_range.start instanceof Date) {
                            month = request.date_range.start.getMonth() + 1;
                        }
                        else if ('start_date' in request.date_range) {
                            const startDate = new Date(request.date_range.start_date);
                            month = startDate.getMonth() + 1;
                        }
                    }
                    else if (request.start_date) {
                        const startDate = new Date(request.start_date);
                        month = startDate.getMonth() + 1;
                    }
                    let dateRangeForAvalanche;
                    if (request.date_range) {
                        if ('start' in request.date_range && request.date_range.start instanceof Date) {
                            dateRangeForAvalanche = {
                                start: request.date_range.start,
                                end: request.date_range.end,
                            };
                        }
                        else if ('start_date' in request.date_range) {
                            dateRangeForAvalanche = {
                                start: new Date(request.date_range.start_date),
                                end: new Date(request.date_range.end_date),
                            };
                        }
                    }
                    const avalancheResult = await this.avalancheRisk.execute({
                        request_id: request.request_id,
                        route: routePoints.length > 0 ? routePoints : [
                            { lat: 64.1466, lng: -21.9426, name: 'Reykjavík' },
                            { lat: 64.75, lng: -18.0, name: 'Highlands' },
                        ],
                        countryCode: 'IS',
                        month,
                        dateRange: dateRangeForAvalanche,
                        riskTolerance: ((_b = request.party_profile) === null || _b === void 0 ? void 0 : _b.risk_tolerance) || 'MEDIUM',
                    });
                    if (avalancheResult.gateRecommendation === 'BLOCK') {
                        this.logger.warn(`[GatekeeperAgent] 雪崩风险评估 BLOCK: ${avalancheResult.overallRisk}`);
                        return {
                            gate_result: 'BLOCK',
                            violations: avalancheResult.blockers.map(blocker => ({
                                type: 'SAFETY',
                                severity: 'HARD',
                                detail: blocker,
                            })),
                            required_adjustments: avalancheResult.adjustments.map(adj => ({
                                action: 'CHANGE_DATES',
                                why: adj,
                            })),
                            confidence: 0.9,
                            evidence_refs: avalancheResult.evidence_refs.map(ref => ({
                                evidence_id: ref.evidence_id,
                                source: ref.source,
                                last_verified_at: ref.last_verified_at,
                                confidence: ref.confidence,
                            })),
                        };
                    }
                    researchData.avalanche_risk_result = avalancheResult;
                    researchData.avalanche_gate_recommendation = avalancheResult.gateRecommendation;
                    researchData.avalanche_hazard_zones = avalancheResult.hazardZones;
                    researchData.avalanche_evidence_refs = avalancheResult.evidence_refs;
                    if (avalancheResult.gateRecommendation === 'ADJUST_REQUIRED' ||
                        avalancheResult.gateRecommendation === 'NEED_USER_CONFIRM') {
                        this.logger.warn(`[GatekeeperAgent] 雪崩风险评估告警: ${avalancheResult.summary}`);
                        if (avalancheResult.warnings.length > 0) {
                            researchData.avalanche_warnings = avalancheResult.warnings;
                        }
                    }
                }
                catch (avalancheError) {
                    this.logger.warn(`[GatekeeperAgent] 雪崩风险评估出错 (降级处理): ${avalancheError === null || avalancheError === void 0 ? void 0 : avalancheError.message}`);
                    researchData.avalanche_check_failed = true;
                    researchData.avalanche_check_error = avalancheError === null || avalancheError === void 0 ? void 0 : avalancheError.message;
                }
            }
            const hardGateResult = this.checkHardGate(request, researchData);
            if (!hardGateResult.allowed) {
                return {
                    gate_result: 'BLOCK',
                    violations: hardGateResult.violations.map(v => ({
                        type: this.mapViolationType(v),
                        severity: 'HARD',
                        detail: v,
                    })),
                    required_adjustments: [],
                    confidence: 0.9,
                    evidence_refs: [],
                };
            }
            if (this.gatePrecheck) {
            }
            if (this.gateRunThreeGuardians) {
            }
            const softChecks = this.performSoftChecks(request, researchData);
            const gateResult = {
                gate_result: softChecks.hasAdjustments ? 'ADJUST_REQUIRED' : 'ALLOW',
                violations: softChecks.violations,
                required_adjustments: softChecks.adjustments,
                confidence: softChecks.confidence,
                evidence_refs: this.extractEvidenceRefs(researchData),
            };
            this.logger.log(`[GatekeeperAgent] Gate 评估完成: ${gateResult.gate_result}, 置信度: ${gateResult.confidence}`);
            return gateResult;
        }
        catch (error) {
            this.logger.error(`[GatekeeperAgent] Gate 评估失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            return {
                gate_result: 'NEED_USER_CONFIRM',
                violations: [{
                        type: 'DATA_MISSING',
                        severity: 'SOFT',
                        detail: `Gate 评估失败: ${(error === null || error === void 0 ? void 0 : error.message) || '未知错误'}`,
                    }],
                required_adjustments: [],
                confidence: 0.3,
                evidence_refs: [],
            };
        }
    }
    checkHardGate(request, researchData) {
        var _a;
        const violations = [];
        if (!request.destination) {
            violations.push('缺少目的地（destination）');
        }
        if (!request.date_range && !request.start_date) {
            violations.push('缺少日期信息（date_range 或 start_date）');
        }
        if (researchData.transport_evidence && Array.isArray(researchData.transport_evidence)) {
            if (researchData.transport_evidence.length === 0) {
                violations.push('起点/终点不可达（无交通证据）');
            }
        }
        if (((_a = researchData.risk_assessment) === null || _a === void 0 ? void 0 : _a.risk_level) === 'CRITICAL') {
            violations.push('关键路段高风险（risk_level=CRITICAL）');
        }
        return {
            allowed: violations.length === 0,
            violations,
        };
    }
    performSoftChecks(request, researchData) {
        var _a, _b, _c, _d, _e;
        const violations = [];
        const adjustments = [];
        let confidence = 0.8;
        if (((_a = researchData.fatigue_estimate) === null || _a === void 0 ? void 0 : _a.daily_fatigue_score) > 0.8) {
            violations.push({
                type: 'FATIGUE',
                severity: 'SOFT',
                detail: `每日疲劳评分过高: ${researchData.fatigue_estimate.daily_fatigue_score}`,
            });
            adjustments.push({
                action: 'SHORTEN_DAY',
                why: '每日疲劳评分超过阈值，建议缩短每日行程',
            });
            confidence -= 0.1;
        }
        if (researchData.dem_metrics) {
            const maxAscent = (_b = request.constraints) === null || _b === void 0 ? void 0 : _b.max_ascent_m;
            if (maxAscent && researchData.dem_metrics.total_ascent_m > maxAscent) {
                violations.push({
                    type: 'DEM',
                    severity: 'SOFT',
                    detail: `累计爬升超出限制: ${researchData.dem_metrics.total_ascent_m}m > ${maxAscent}m`,
                });
                adjustments.push({
                    action: 'REPLACE_SEGMENT',
                    why: '累计爬升超出用户能力，建议替换为更平缓的路段',
                });
                confidence -= 0.1;
            }
        }
        if (researchData.opening_hours_evidence) {
        }
        if (researchData.avalanche_gate_recommendation === 'ADJUST_REQUIRED') {
            violations.push({
                type: 'SAFETY',
                severity: 'SOFT',
                detail: `雪崩风险需要调整: ${((_c = researchData.avalanche_risk_result) === null || _c === void 0 ? void 0 : _c.summary) || '路线存在雪崩风险'}`,
            });
            if ((_d = researchData.avalanche_risk_result) === null || _d === void 0 ? void 0 : _d.adjustments) {
                for (const adjustment of researchData.avalanche_risk_result.adjustments) {
                    adjustments.push({
                        action: 'CHANGE_DATES',
                        why: adjustment,
                    });
                }
            }
            confidence -= 0.15;
        }
        else if (researchData.avalanche_gate_recommendation === 'NEED_USER_CONFIRM') {
            violations.push({
                type: 'SAFETY',
                severity: 'SOFT',
                detail: `雪崩风险需要用户确认: ${((_e = researchData.avalanche_risk_result) === null || _e === void 0 ? void 0 : _e.summary) || '路线可能存在雪崩风险'}`,
            });
            confidence -= 0.05;
        }
        if (researchData.avalanche_warnings && Array.isArray(researchData.avalanche_warnings)) {
            for (const warning of researchData.avalanche_warnings) {
                violations.push({
                    type: 'SAFETY',
                    severity: 'SOFT',
                    detail: `雪崩风险警告: ${warning}`,
                });
            }
        }
        return {
            hasAdjustments: adjustments.length > 0,
            violations,
            adjustments,
            confidence: Math.max(0.1, confidence),
        };
    }
    extractEvidenceRefs(researchData) {
        const evidenceRefs = [];
        if (researchData.transport_evidence && Array.isArray(researchData.transport_evidence)) {
            evidenceRefs.push(...researchData.transport_evidence.map((e) => e.evidence_id || e.id).filter(Boolean));
        }
        if (researchData.poi_evidence && Array.isArray(researchData.poi_evidence)) {
            evidenceRefs.push(...researchData.poi_evidence.map((e) => e.evidence_id || e.id).filter(Boolean));
        }
        if (researchData.opening_hours_evidence && Array.isArray(researchData.opening_hours_evidence)) {
            evidenceRefs.push(...researchData.opening_hours_evidence.map((e) => e.evidence_id || e.id).filter(Boolean));
        }
        if (researchData.avalanche_evidence_refs && Array.isArray(researchData.avalanche_evidence_refs)) {
            evidenceRefs.push(...researchData.avalanche_evidence_refs.map((e) => e.evidence_id || e.id).filter(Boolean));
        }
        return evidenceRefs;
    }
    mapViolationType(violation) {
        if (violation.includes('不可达') || violation.includes('交通')) {
            return 'REACHABILITY';
        }
        if (violation.includes('风险') || violation.includes('安全')) {
            return 'SAFETY';
        }
        if (violation.includes('DEM') || violation.includes('爬升')) {
            return 'DEM';
        }
        if (violation.includes('缺失') || violation.includes('缺少')) {
            return 'DATA_MISSING';
        }
        return 'DATA_MISSING';
    }
    isIcelandTrip(request) {
        const destination = typeof request.destination === 'string'
            ? request.destination.toLowerCase()
            : '';
        const origin = request.origin && typeof request.origin === 'string'
            ? request.origin.toLowerCase()
            : '';
        return destination.includes('iceland') ||
            destination.includes('冰岛') ||
            origin.includes('iceland') ||
            origin.includes('冰岛') ||
            /F\d{1,3}/i.test(destination) ||
            /F\d{1,3}/i.test(origin);
    }
    toLocationString(location) {
        if (!location)
            return undefined;
        if (typeof location === 'string')
            return location;
        return `${location.lat},${location.lng}`;
    }
};
exports.ClaudeGatekeeperAgentService = ClaudeGatekeeperAgentService;
exports.ClaudeGatekeeperAgentService = ClaudeGatekeeperAgentService = ClaudeGatekeeperAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [plan_gate_run_three_guardians_skill_1.PlanGateRunThreeGuardiansSkill,
        plan_gate_precheck_skill_1.PlanGatePrecheckSkill,
        f_road_check_skill_1.FRoadCheckSkill,
        weather_alert_skill_1.WeatherAlertSkill,
        avalanche_risk_assessment_skill_1.AvalancheRiskAssessmentSkill])
], ClaudeGatekeeperAgentService);
//# sourceMappingURL=gatekeeper-agent.service.js.map