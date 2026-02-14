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
var TripDecisionEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripDecisionEngineService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const abu_1 = require("./strategies/abu");
const drdre_1 = require("./strategies/drdre");
const neptune_1 = require("./strategies/neptune");
const sense_tools_adapter_1 = require("./adapters/sense-tools.adapter");
const readiness_service_1 = require("../readiness/services/readiness.service");
const route_direction_selector_service_1 = require("../../route-directions/services/route-direction-selector.service");
const route_direction_poi_generator_service_1 = require("../../route-directions/services/route-direction-poi-generator.service");
const route_direction_observability_service_1 = require("../../route-directions/services/route-direction-observability.service");
const compliance_plugin_service_1 = require("../../route-directions/plugins/compliance-plugin.service");
const transport_plugin_service_1 = require("../../route-directions/plugins/transport-plugin.service");
const objective_config_1 = require("./config/objective-config");
const decision_params_injector_service_1 = require("../../agent/memory/services/decision-params-injector.service");
const memory_service_1 = require("../../agent/memory/services/memory.service");
const constraint_dsl_compiler_service_1 = require("./constraints/constraint-dsl-compiler.service");
const constraint_conflict_resolver_service_1 = require("./constraints/constraint-conflict-resolver.service");
const multi_plan_generator_service_1 = require("./services/multi-plan-generator.service");
const dem_daily_energy_service_1 = require("./services/dem-daily-energy.service");
const dem_route_segmentation_service_1 = require("./services/dem-route-segmentation.service");
const dem_risk_scoring_service_1 = require("./services/dem-risk-scoring.service");
const dem_evidence_chain_service_1 = require("./services/dem-evidence-chain.service");
const dry_run_planner_service_1 = require("./services/dry-run-planner.service");
const dem_decision_evidence_pipeline_service_1 = require("./services/dem-decision-evidence-pipeline.service");
const dem_evidence_enforcer_service_1 = require("./services/dem-evidence-enforcer.service");
const dem_decision_evidence_service_1 = require("./services/dem-decision-evidence.service");
const strategy_orchestrator_service_1 = require("./services/strategy-orchestrator.service");
const plan_converter_service_1 = require("./services/plan-converter.service");
const user_persona_mapping_config_1 = require("./config/user-persona-mapping.config");
const human_capability_model_1 = require("./models/human-capability.model");
const readiness_agent_service_1 = require("./readiness/readiness-agent.service");
let TripDecisionEngineService = TripDecisionEngineService_1 = class TripDecisionEngineService {
    constructor(tools, moduleRef, routeDirectionSelector, routeDirectionPoiGenerator, observabilityService, compliancePlugin, transportPlugin, demDailyEnergyService, demRouteSegmentationService, demRiskScoringService, demEvidenceChainService, decisionParamsInjector, memoryService, dryRunPlanner, demEvidencePipeline, demEvidenceEnforcer, demDecisionEvidenceService, strategyOrchestrator, planConverter, constraintDSLCompiler, conflictResolver, multiPlanGenerator) {
        this.tools = tools;
        this.moduleRef = moduleRef;
        this.routeDirectionSelector = routeDirectionSelector;
        this.routeDirectionPoiGenerator = routeDirectionPoiGenerator;
        this.observabilityService = observabilityService;
        this.compliancePlugin = compliancePlugin;
        this.transportPlugin = transportPlugin;
        this.demDailyEnergyService = demDailyEnergyService;
        this.demRouteSegmentationService = demRouteSegmentationService;
        this.demRiskScoringService = demRiskScoringService;
        this.demEvidenceChainService = demEvidenceChainService;
        this.decisionParamsInjector = decisionParamsInjector;
        this.memoryService = memoryService;
        this.dryRunPlanner = dryRunPlanner;
        this.demEvidencePipeline = demEvidencePipeline;
        this.demEvidenceEnforcer = demEvidenceEnforcer;
        this.demDecisionEvidenceService = demDecisionEvidenceService;
        this.strategyOrchestrator = strategyOrchestrator;
        this.planConverter = planConverter;
        this.constraintDSLCompiler = constraintDSLCompiler;
        this.conflictResolver = conflictResolver;
        this.multiPlanGenerator = multiPlanGenerator;
        this.logger = new common_1.Logger(TripDecisionEngineService_1.name);
    }
    getReadinessService() {
        if (!this.readinessService) {
            try {
                this.readinessService = this.moduleRef.get(readiness_service_1.ReadinessService, { strict: false });
            }
            catch (error) {
                this.logger.warn('无法获取 ReadinessService，准备度检查功能将不可用');
                return null;
            }
        }
        return this.readinessService || null;
    }
    getReadinessAgent() {
        if (!this.readinessAgent) {
            try {
                this.readinessAgent = this.moduleRef.get(readiness_agent_service_1.ReadinessAgentService, { strict: false });
            }
            catch (error) {
                this.logger.warn('无法获取 ReadinessAgentService，准备度代理功能将不可用');
                return null;
            }
        }
        return this.readinessAgent || null;
    }
    async generatePlan(state, requestId) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
        if (!state || !state.context) {
            throw new Error('Invalid state: state and state.context are required');
        }
        const traceRequestId = requestId || `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        if (this.observabilityService) {
            this.observabilityService.createTrace(traceRequestId);
            const initialPoolSize = Object.values(state.candidatesByDate).reduce((sum, candidates) => sum + candidates.length, 0);
            this.observabilityService.recordPoiPoolSize(traceRequestId, initialPoolSize, 'initial');
        }
        const planGenerateStartTime = Date.now();
        const readinessService = this.getReadinessService();
        if (readinessService) {
            try {
                const context = readinessService.extractTripContext(state);
                const startLocation = ((_b = (_a = state.context.anchors) === null || _a === void 0 ? void 0 : _a.hotelLocationsByDate) === null || _b === void 0 ? void 0 : _b[state.context.startDate]) ||
                    ((_e = (_d = (_c = state.candidatesByDate[state.context.startDate]) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.location) === null || _e === void 0 ? void 0 : _e.point);
                const readinessResult = await readinessService.checkFromDestination(state.context.destination, context, {
                    enhanceWithGeo: !!startLocation,
                    geoLat: startLocation === null || startLocation === void 0 ? void 0 : startLocation.lat,
                    geoLng: startLocation === null || startLocation === void 0 ? void 0 : startLocation.lng,
                });
                if (readinessResult.summary.totalBlockers > 0) {
                    this.logger.warn(`Readiness check found ${readinessResult.summary.totalBlockers} blockers for destination ${state.context.destination}`);
                }
                if (readinessResult.summary.totalMust > 0) {
                    this.logger.log(`Readiness check found ${readinessResult.summary.totalMust} must items for destination ${state.context.destination}`);
                }
                const readinessConstraints = await readinessService.getConstraints(readinessResult);
                if (!state.signals.alerts) {
                    state.signals.alerts = [];
                }
                for (const constraint of readinessConstraints) {
                    if (constraint.type === 'hard' && constraint.severity === 'error') {
                        state.signals.alerts.push({
                            code: constraint.id,
                            severity: 'critical',
                            message: constraint.message,
                        });
                    }
                    else if (constraint.severity === 'warning') {
                        state.signals.alerts.push({
                            code: constraint.id,
                            severity: 'warn',
                            message: constraint.message,
                        });
                    }
                }
                state.readinessResult = readinessResult;
            }
            catch (error) {
                this.logger.warn(`Readiness check failed: ${error}`);
            }
        }
        const userId = state.context.userId;
        let decisionParams = null;
        if (userId && this.decisionParamsInjector) {
            try {
                decisionParams = await this.decisionParamsInjector.getDecisionParamsForUser(userId);
                this.decisionParamsInjector.injectConstraintsToWorldModel(state, decisionParams);
                this.logger.log(`Injected decision params for user ${userId}`);
            }
            catch (error) {
                this.logger.warn(`Failed to load/inject decision params: ${error}`);
            }
        }
        let selectedRouteDirection = null;
        if (this.routeDirectionSelector) {
            try {
                const countryCode = this.extractCountryCode(state.context.destination);
                const month = this.extractMonth(state.context.startDate);
                const userIntent = {
                    preferences: this.extractPreferences(state.context.preferences),
                    pace: state.context.preferences.pace,
                    riskTolerance: state.context.preferences.riskTolerance,
                    durationDays: state.context.durationDays,
                    userId: userId,
                };
                const recommendations = await this.routeDirectionSelector.pickRouteDirections(userIntent, countryCode, month, traceRequestId);
                state.routeDirectionRecommendations = recommendations;
                if (recommendations.length > 0) {
                    selectedRouteDirection = recommendations[0];
                    this.logger.log(`选择了路线方向: ${selectedRouteDirection.routeDirection.name} (score: ${selectedRouteDirection.score})`);
                    if (selectedRouteDirection.constraints) {
                        const constraintsInjectStartTime = Date.now();
                        this.injectConstraints(state, selectedRouteDirection.constraints);
                        if (this.observabilityService) {
                            this.observabilityService.recordConstraintsInjectLatency(traceRequestId, Date.now() - constraintsInjectStartTime);
                        }
                    }
                    if (this.compliancePlugin) {
                        try {
                            const complianceChecklist = this.compliancePlugin.generateChecklist(selectedRouteDirection, undefined, selectedRouteDirection.routeDirection.regions, undefined, state.context.complianceStatus);
                            if (complianceChecklist.userActionRequired.hard.length > 0 &&
                                complianceChecklist.downgradeOptions) {
                                this.logger.warn(`用户拒绝办理合规项，触发降级：${complianceChecklist.downgradeOptions.reason}`);
                                state.complianceDowngrade = complianceChecklist.downgradeOptions;
                            }
                            state.complianceChecklist = complianceChecklist;
                        }
                        catch (error) {
                            this.logger.warn(`合规检查失败: ${error}`);
                        }
                    }
                    if (this.transportPlugin) {
                        try {
                            const transportChecklist = this.transportPlugin.generateChecklist(selectedRouteDirection, undefined, undefined, state.context.transportBookingStatus);
                            if (transportChecklist.summary.unavailableModes &&
                                transportChecklist.summary.unavailableModes.length > 0) {
                                this.logger.warn(`交通模式不可用: ${transportChecklist.summary.unavailableModes.join(', ')}，将触发 Neptune 修复`);
                                state.transportNeptuneActions = transportChecklist.neptuneActions;
                            }
                            state.transportChecklist = transportChecklist;
                        }
                        catch (error) {
                            this.logger.warn(`交通模式检查失败: ${error}`);
                        }
                    }
                    let routeSegmentation = null;
                    if (this.demRouteSegmentationService && selectedRouteDirection.routeDirection.corridorGeom) {
                        try {
                            const segmentationStartTime = Date.now();
                            routeSegmentation = await this.demRouteSegmentationService.segmentRoute(selectedRouteDirection.routeDirection.corridorGeom, {
                                samplingInterval: 100,
                                steepSlopeThreshold: 15,
                                steepSectionMinLength: 500,
                                energyBreakpointThreshold: 70,
                                highAltitudeThreshold: 3000,
                                consecutiveAscentThreshold: 1200,
                                baseCostPerKm: 5,
                                ascentFactor: 0.1,
                            });
                            const segmentationLatency = Date.now() - segmentationStartTime;
                            this.logger.log(`路线拆段分析完成: ${routeSegmentation.steepSections.length}个过陡段, ` +
                                `${routeSegmentation.energyBreakpoints.length}个体力断点, ` +
                                `${routeSegmentation.mandatoryRestPoints.length}个强制休息点 ` +
                                `(耗时: ${segmentationLatency}ms)`);
                            state.routeSegmentation = routeSegmentation;
                        }
                        catch (error) {
                            this.logger.warn(`路线拆段分析失败: ${error}`);
                        }
                    }
                    if (this.routeDirectionPoiGenerator) {
                        const poiPoolQueryStartTime = Date.now();
                        const routePois = await this.routeDirectionPoiGenerator.generateCandidatePois(selectedRouteDirection, selectedRouteDirection.routeDirection.regions);
                        if (this.observabilityService) {
                            this.observabilityService.recordPoiPoolQueryLatency(traceRequestId, Date.now() - poiPoolQueryStartTime);
                            const afterRdFilterSize = Object.values(state.candidatesByDate).reduce((sum, candidates) => sum + candidates.length, 0);
                            this.observabilityService.recordPoiPoolSize(traceRequestId, afterRdFilterSize, 'afterRdFilter');
                        }
                        this.mergeCandidatePois(state, routePois);
                        if (this.observabilityService) {
                            const afterMergeSize = Object.values(state.candidatesByDate).reduce((sum, candidates) => sum + candidates.length, 0);
                            this.observabilityService.recordPoiPoolSize(traceRequestId, afterMergeSize, 'afterConstraints');
                        }
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Route direction selection failed: ${error}`);
            }
        }
        const now = new Date().toISOString();
        const pace = state.context.preferences.pace || 'moderate';
        const paceMultiplier = this.getPaceMultiplier(pace);
        const dayStart = pace === 'relaxed'
            ? '09:00'
            : pace === 'intense'
                ? '07:00'
                : ((_g = (_f = state.policies) === null || _f === void 0 ? void 0 : _f.dayStart) !== null && _g !== void 0 ? _g : '08:30');
        const dayEnd = pace === 'relaxed'
            ? '19:00'
            : pace === 'intense'
                ? '22:00'
                : ((_j = (_h = state.policies) === null || _h === void 0 ? void 0 : _h.dayEnd) !== null && _j !== void 0 ? _j : '20:30');
        const buffer = Math.round(((_l = (_k = state.policies) === null || _k === void 0 ? void 0 : _k.bufferMinBetweenActivities) !== null && _l !== void 0 ? _l : 10) * paceMultiplier.buffer);
        const days = [];
        const dailyEnergyBudgets = [];
        for (let i = 0; i < state.context.durationDays; i++) {
            const date = addDays(state.context.startDate, i);
            const pool = state.candidatesByDate[date] || [];
            const policyProfile = (0, objective_config_1.getPolicyProfile)(pace);
            let maxActiveMin = pace === 'relaxed'
                ? 240
                : pace === 'intense'
                    ? 420
                    : 330;
            if (pace === 'relaxed') {
                maxActiveMin = Math.round(maxActiveMin * 0.9);
            }
            else if (pace === 'intense') {
                maxActiveMin = Math.round(maxActiveMin * 1.1);
            }
            let adjustedPool = pool;
            if (state.complianceDowngrade) {
                adjustedPool = this.filterPoolForComplianceDowngrade(pool);
                this.logger.log(`合规降级：从 ${pool.length} 个候选 POI 过滤到 ${adjustedPool.length} 个`);
            }
            let shouldBeMoreConservative = false;
            if (this.demEvidenceEnforcer && i > 0 && state.previousDayDemEvidence) {
                const prevDayEvidence = state.previousDayDemEvidence;
                for (const evidence of prevDayEvidence) {
                    if (evidence.violation === 'HARD') {
                        const canIgnore = this.demEvidenceEnforcer.canAbuIgnoreViolation(evidence.segmentId, { segmentEvidences: prevDayEvidence });
                        if (!canIgnore.allowed) {
                            this.logger.warn(`Abu 不能忽略前一天的 HARD violation (${evidence.segmentId}): ${canIgnore.reason}，今天将更保守地选择活动`);
                            shouldBeMoreConservative = true;
                            maxActiveMin = Math.round(maxActiveMin * 0.9);
                        }
                    }
                }
            }
            const abu = (0, abu_1.abuSelectCoreActivities)(state, date, adjustedPool, {
                maxActiveMin,
                maxCost: (_m = state.context.budget) === null || _m === void 0 ? void 0 : _m.amount,
            });
            const hotelPoint = ((_p = (_o = state.context.anchors) === null || _o === void 0 ? void 0 : _o.hotelLocationsByDate) === null || _p === void 0 ? void 0 : _p[date]) ||
                (this.tools.getHotelPointForDate
                    ? await this.tools.getHotelPointForDate(date)
                    : undefined);
            const riskWeights = new Map();
            let previousElevation;
            if (this.demRiskScoringService && i > 0) {
                const prevDay = days[i - 1];
                if (prevDay.timeSlots.length > 0) {
                    const lastSlot = prevDay.timeSlots[prevDay.timeSlots.length - 1];
                    if (lastSlot.coordinates && this.demRiskScoringService) {
                        previousElevation = (_q = prevDay.terrainFacts) === null || _q === void 0 ? void 0 : _q.maxElevation;
                    }
                }
            }
            if (this.demRiskScoringService) {
                for (const activity of abu.kept) {
                    try {
                        const riskWeight = await this.demRiskScoringService.getRiskWeightForDrDre(activity, previousElevation);
                        riskWeights.set(activity.id, riskWeight);
                    }
                    catch (error) {
                        this.logger.warn(`计算活动 ${activity.id} 风险权重失败: ${error}`);
                    }
                }
            }
            const slots = await (0, drdre_1.drdreBuildDaySchedule)(state, {
                date,
                startTime: dayStart,
                endTime: dayEnd,
                bufferMin: buffer,
                startPoint: hotelPoint,
                riskWeights,
                previousElevation,
            }, abu.kept, this.tools.getTravelLeg);
            const terrainFacts = this.computeDayTerrainFacts(selectedRouteDirection, abu.kept, slots, state.routeSegmentation);
            let dailyEnergyBudget = undefined;
            if (this.demDailyEnergyService && slots.length > 0) {
                try {
                    const dayPlan = {
                        day: i + 1,
                        date,
                        timeSlots: slots,
                        terrainFacts,
                    };
                    dailyEnergyBudget = await this.demDailyEnergyService.calculateDynamicDailyBudget(dayPlan, selectedRouteDirection === null || selectedRouteDirection === void 0 ? void 0 : selectedRouteDirection.routeDirection, pace);
                    if (dailyEnergyBudget.totalEnergyCost > dailyEnergyBudget.maxEnergyCost) {
                        this.logger.warn(`Day ${i + 1} 体力预算超限: 消耗 ${dailyEnergyBudget.totalEnergyCost.toFixed(1)}, 预算 ${dailyEnergyBudget.maxEnergyCost}`);
                    }
                    if (terrainFacts) {
                        terrainFacts.effortLevel = this.inferEffortLevel(dailyEnergyBudget);
                    }
                    dailyEnergyBudgets.push({ day: i + 1, budget: dailyEnergyBudget });
                }
                catch (error) {
                    this.logger.warn(`Day ${i + 1} DEM体力预算计算失败: ${error}`);
                }
            }
            days.push({
                day: i + 1,
                date,
                timeSlots: slots,
                terrainFacts,
            });
        }
        const plan = {
            version: 'planner-0.1',
            createdAt: now,
            days,
        };
        let dryRunResult = null;
        if (this.dryRunPlanner) {
            try {
                dryRunResult = await this.dryRunPlanner.simulatePlan(state, plan, decisionParams || undefined);
                if (dryRunResult.willFail) {
                    this.logger.warn(`Dry-run detected potential failure on day ${dryRunResult.failureDay}: ${dryRunResult.failureReason}`);
                    const suggestions = this.dryRunPlanner.generateAdjustmentSuggestions(dryRunResult);
                    this.logger.warn(`Dry-run suggestions: ${suggestions.join('; ')}`);
                }
                else {
                    this.logger.debug(`Dry-run passed: no critical issues detected`);
                }
            }
            catch (error) {
                this.logger.warn(`Dry-run simulation failed: ${error}`);
            }
        }
        let planRiskScore;
        if (this.demRiskScoringService) {
            try {
                planRiskScore = await this.demRiskScoringService.calculatePlanRiskScore(plan, state.routeSegmentation);
            }
            catch (error) {
                this.logger.warn(`计算计划风险评分失败: ${error}`);
            }
        }
        let evidenceChain;
        if (this.demEvidenceChainService) {
            try {
                evidenceChain = this.demEvidenceChainService.generateEvidenceChain(plan, state.routeSegmentation, planRiskScore, dailyEnergyBudgets, selectedRouteDirection);
                this.logger.log(`生成了路线规划证据链：${evidenceChain.dailyEvidences.length}天的证据`);
            }
            catch (error) {
                this.logger.warn(`生成证据链失败: ${error}`);
            }
        }
        let demEvidenceResult;
        if (this.demDecisionEvidenceService) {
            try {
                const routeSegmentation = state.routeSegmentation;
                const routeDirectionData = selectedRouteDirection === null || selectedRouteDirection === void 0 ? void 0 : selectedRouteDirection.routeDirection;
                demEvidenceResult = await this.demDecisionEvidenceService.generateEvidencePipeline(plan, routeDirectionData, routeSegmentation);
                this.logger.log(`DEM决策证据生成完成：${demEvidenceResult.segmentEvidences.length}个路段证据，` +
                    `HARD违规: ${demEvidenceResult.hasHardViolation}, ` +
                    `SOFT违规: ${demEvidenceResult.hasSoftViolation}, ` +
                    `可通过: ${demEvidenceResult.canProceed}`);
                const validation = this.demDecisionEvidenceService.validatePlanHasEvidence(plan, demEvidenceResult.segmentEvidences);
                if (!validation.valid) {
                    this.logger.warn(`计划验证失败: ${validation.reason}`);
                }
                if (demEvidenceResult.hasHardViolation) {
                    this.logger.error(`计划存在硬约束违反，不能 finalize。失败原因: ${((_r = demEvidenceResult.explainableFailure) === null || _r === void 0 ? void 0 : _r.reason) || '未知'}`);
                }
                if ((_s = demEvidenceResult.rollingFatigue) === null || _s === void 0 ? void 0 : _s.detected) {
                    this.logger.warn(`检测到连续疲劳：${demEvidenceResult.rollingFatigue.explanation}，建议：${demEvidenceResult.rollingFatigue.suggestedAction}`);
                    if (demEvidenceResult.rollingFatigue.suggestedAction === 'INSERT_REST_DAY') {
                        const restDay = demEvidenceResult.rollingFatigue.startDay + 1;
                        if (restDay <= plan.days.length) {
                            this.logger.log(`Dr.Dre 自动插入休息日：第 ${restDay} 天`);
                            const dayToRest = plan.days[restDay - 1];
                            if (dayToRest && dayToRest.timeSlots.length > 0) {
                                const firstSlot = dayToRest.timeSlots[0];
                                const lastSlot = dayToRest.timeSlots[dayToRest.timeSlots.length - 1];
                                const restSlot = {
                                    id: `rest_${dayToRest.date}_${restDay}`,
                                    time: firstSlot.time,
                                    endTime: lastSlot.endTime || lastSlot.time,
                                    title: '休息日 / 自由活动',
                                    type: 'rest',
                                    reasons: [
                                        `Dr.Dre 自动插入：检测到连续疲劳（第 ${demEvidenceResult.rollingFatigue.startDay}-${demEvidenceResult.rollingFatigue.endDay} 天累计爬升 ${demEvidenceResult.rollingFatigue.rollingAscent3Days.toFixed(0)}m）`,
                                    ],
                                };
                                dayToRest.timeSlots = [firstSlot, restSlot, lastSlot];
                                this.logger.log(`已将第 ${restDay} 天的活动替换为休息日`);
                            }
                        }
                    }
                }
                if (demEvidenceResult.corridorQuality) {
                    this.logger.log(`走廊质量评分: ${demEvidenceResult.corridorQuality.totalScore.toFixed(1)}/100 ` +
                        `(${demEvidenceResult.corridorQuality.explanation})`);
                }
            }
            catch (error) {
                this.logger.error(`DEM决策证据生成失败: ${error}`);
            }
        }
        else if (this.demEvidencePipeline) {
            try {
                const userConstraints = decisionParams ? {
                    maxDailyAscentM: decisionParams.constraints.maxDailyAscentM,
                    maxElevationM: decisionParams.constraints.maxElevationM,
                    maxSlopePct: decisionParams.constraints.maxSlopePct,
                    rollingAscent3DaysThreshold: 2000,
                } : undefined;
                demEvidenceResult = await this.demEvidencePipeline.generateEvidenceForPlan(plan, userConstraints);
                this.logger.log(`DEM证据管道完成：${demEvidenceResult.segmentEvidences.length}个路段证据，` +
                    `HARD违规: ${demEvidenceResult.hasHardViolation}, ` +
                    `SOFT违规: ${demEvidenceResult.hasSoftViolation}`);
                if (this.demEvidenceEnforcer) {
                    const canFinalize = this.demEvidenceEnforcer.canFinalizePlan(demEvidenceResult);
                    if (!canFinalize.allowed) {
                        this.logger.warn(`计划不能 finalize: ${canFinalize.reason}`);
                    }
                    if ((_t = demEvidenceResult.rollingFatigue) === null || _t === void 0 ? void 0 : _t.detected) {
                        this.logger.warn(`检测到连续疲劳：${demEvidenceResult.rollingFatigue.explanation}`);
                    }
                }
            }
            catch (error) {
                this.logger.error(`DEM证据管道失败: ${error}`);
            }
        }
        let strategyLogs = [];
        let finalPlan = plan;
        let routeDirectionExplanation;
        if (this.strategyOrchestrator && this.planConverter && selectedRouteDirection) {
            try {
                const intentKeys = state.context.preferences.intents
                    ? Object.keys(state.context.preferences.intents).filter(k => (state.context.preferences.intents[k] || 0) > 0.3)
                    : [];
                const personaKeywords = (0, user_persona_mapping_config_1.extractPersonaKeywordsFromPreferences)({
                    pace: state.context.preferences.pace,
                    preferences: intentKeys,
                    riskTolerance: state.context.preferences.riskTolerance,
                });
                const mappedDecisionParams = (0, user_persona_mapping_config_1.mapUserPersonaToDecisionParams)(personaKeywords);
                const countryCode = this.extractCountryCode(state.context.destination);
                const month = this.extractMonth(state.context.startDate);
                const demEvidence = [];
                if (demEvidenceResult === null || demEvidenceResult === void 0 ? void 0 : demEvidenceResult.segmentEvidences) {
                    for (const evidence of demEvidenceResult.segmentEvidences) {
                        demEvidence.push({
                            segmentId: evidence.segmentId,
                            elevationProfile: evidence.elevationProfile || [],
                            cumulativeAscent: evidence.cumulativeAscent || 0,
                            maxSlopePct: evidence.maxSlopePct || 0,
                            rollingAscent3Days: evidence.rollingAscent3Days || 0,
                            fatigueIndex: evidence.fatigueIndex || 0,
                            violation: evidence.violation || 'NONE',
                            explanation: evidence.explanation || '',
                            metadata: evidence.metadata || {},
                        });
                    }
                }
                const weatherEvidence = [];
                const complianceEvidence = [];
                if ((_u = selectedRouteDirection.constraints) === null || _u === void 0 ? void 0 : _u.hard) {
                    complianceEvidence.push({
                        requiresPermit: selectedRouteDirection.constraints.hard.requiresPermit || false,
                        requiresGuide: selectedRouteDirection.constraints.hard.requiresGuide || false,
                        valid: true,
                        violation: 'NONE',
                    });
                }
                const physical = {
                    demEvidence,
                    roadStates: [],
                    hazardZones: [],
                    ferryStates: [],
                    countryCode,
                    month,
                };
                const human = (0, human_capability_model_1.createHumanCapabilityModelFromProfile)(`user_${state.context.userId || 'anonymous'}`, {
                    pace: state.context.preferences.pace === 'relaxed' ? 'slow' :
                        state.context.preferences.pace === 'intense' ? 'fast' : 'normal',
                    fitness: 'medium',
                    riskTolerance: state.context.preferences.riskTolerance === 'low' ? 'low' :
                        state.context.preferences.riskTolerance === 'high' ? 'high' : 'medium',
                });
                const routeDirection = {
                    ...selectedRouteDirection.routeDirection,
                };
                const worldContext = {
                    physical,
                    human,
                    routeDirection,
                    complianceEvidence: complianceEvidence.length > 0 ? complianceEvidence : undefined,
                };
                const tripId = state.context.tripId || `trip_${Date.now()}`;
                const routeDirectionId = selectedRouteDirection.routeDirection.uuid ||
                    String(selectedRouteDirection.routeDirection.id);
                const routePlanDraft = this.planConverter.convertTripPlanToRoutePlanDraft(plan, tripId, routeDirectionId);
                this.logger.log('开始执行三人格策略编排（Abu → Dr.Dre → Neptune）');
                const strategyResult = await this.strategyOrchestrator.run(worldContext, routePlanDraft);
                strategyLogs = strategyResult.logs;
                if (!strategyResult.allowed || !strategyResult.plan) {
                    this.logger.warn(`计划被三人格策略拒绝: ${strategyResult.finalAction}`);
                    const log = {
                        runId: `run_${Date.now()}`,
                        at: now,
                        trigger: 'initial_generate',
                        plannerVersion: plan.version,
                        strategyMix: ['abu', 'drdre', 'neptune'],
                        inputDigest: {
                            destination: state.context.destination,
                            startDate: state.context.startDate,
                            durationDays: state.context.durationDays,
                            signalUpdatedAt: state.signals.lastUpdatedAt,
                        },
                        chosenActions: [],
                        explanation: ((_v = strategyLogs[0]) === null || _v === void 0 ? void 0 : _v.explanation) || '计划被拒绝',
                        routeDirection: selectedRouteDirection
                            ? {
                                selected: {
                                    id: selectedRouteDirection.routeDirection.id,
                                    uuid: selectedRouteDirection.routeDirection.uuid,
                                    name: selectedRouteDirection.routeDirection.name,
                                    nameCN: selectedRouteDirection.routeDirection.nameCN,
                                },
                            }
                            : undefined,
                        strategyLogs: strategyLogs,
                    };
                    return {
                        plan: null,
                        log,
                    };
                }
                finalPlan = this.planConverter.applyRoutePlanDraftToTripPlan(strategyResult.plan, plan, state);
                if (selectedRouteDirection.reasons && selectedRouteDirection.reasons.length > 0) {
                    routeDirectionExplanation = selectedRouteDirection.reasons.join('；');
                }
                else {
                    routeDirectionExplanation = `选择了 ${selectedRouteDirection.routeDirection.nameCN || selectedRouteDirection.routeDirection.name} 路线方向`;
                }
                this.logger.log(`三人格策略执行完成: ${strategyResult.finalAction}, ` +
                    `调整数: ${strategyLogs.filter(l => l.action !== 'ALLOW').length}`);
            }
            catch (error) {
                this.logger.error(`三人格策略执行失败: ${error}`);
            }
        }
        const log = {
            runId: `run_${Date.now()}`,
            at: now,
            trigger: 'initial_generate',
            plannerVersion: finalPlan.version,
            strategyMix: ['abu', 'drdre', 'neptune'],
            inputDigest: {
                destination: state.context.destination,
                startDate: state.context.startDate,
                durationDays: state.context.durationDays,
                signalUpdatedAt: state.signals.lastUpdatedAt,
            },
            chosenActions: [
                {
                    actionType: 'prioritize',
                    reasonCodes: ['RISK_BASED'],
                    payload: { days: state.context.durationDays },
                },
            ],
            explanation: 'Generated plan using Abu(core selection) + DrDre(day scheduling) + Neptune(spatial repair).',
            routeDirection: selectedRouteDirection
                ? {
                    selected: {
                        id: selectedRouteDirection.routeDirection.id,
                        uuid: selectedRouteDirection.routeDirection.uuid,
                        name: selectedRouteDirection.routeDirection.name,
                        nameCN: selectedRouteDirection.routeDirection.nameCN,
                    },
                    scoreBreakdown: selectedRouteDirection.scoreBreakdown,
                    constraints: selectedRouteDirection.constraints,
                    matchedSignals: selectedRouteDirection.matchedSignals,
                }
                : undefined,
            evidenceChain: evidenceChain,
            dryRunResult: dryRunResult,
            demEvidence: demEvidenceResult,
            strategyLogs: strategyLogs,
            routeDirectionExplanation: routeDirectionExplanation,
        };
        if (selectedRouteDirection && userId && this.memoryService) {
            try {
                const countryCode = this.extractCountryCode(state.context.destination);
                const month = this.extractMonth(state.context.startDate);
                const rejectedIds = [];
                if (selectedRouteDirection && state.routeDirectionRecommendations) {
                    const recommendations = state.routeDirectionRecommendations;
                    rejectedIds.push(...recommendations.slice(1, 4).map(r => r.routeDirection.id));
                }
                await this.memoryService.saveRouteDirectionDecision({
                    id: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    userId,
                    tripId: state.context.tripId,
                    countryCode,
                    month,
                    selectedRouteDirectionId: selectedRouteDirection.routeDirection.id,
                    rejectedRouteDirectionIds: rejectedIds,
                    keyConstraints: selectedRouteDirection.constraints || {},
                    scoreBreakdown: selectedRouteDirection.scoreBreakdown || {},
                    explanation: {
                        whySelected: ((_w = selectedRouteDirection.reasons) === null || _w === void 0 ? void 0 : _w.join('; ')) || '基于评分选择',
                        whyRejected: rejectedIds.map(id => ({
                            id,
                            reason: '评分较低',
                        })),
                        riskPoints: selectedRouteDirection.routeDirection.riskProfile
                            ? Object.keys(selectedRouteDirection.routeDirection.riskProfile)
                                .filter(k => selectedRouteDirection.routeDirection.riskProfile[k])
                                .map(k => k)
                            : [],
                        adjustmentSuggestions: (dryRunResult === null || dryRunResult === void 0 ? void 0 : dryRunResult.recommendations) || [],
                    },
                    createdAt: new Date(),
                });
                this.logger.debug(`Saved route direction decision memory for user ${userId}`);
            }
            catch (error) {
                this.logger.warn(`Failed to save decision memory: ${error}`);
            }
        }
        if (this.observabilityService) {
            const planGenerateLatency = Date.now() - planGenerateStartTime;
            this.observabilityService.recordPlanGenerateLatency(traceRequestId, planGenerateLatency);
            const finalPoolSize = Object.values(state.candidatesByDate).reduce((sum, candidates) => sum + candidates.length, 0);
            this.observabilityService.recordPoiPoolSize(traceRequestId, finalPoolSize, 'final');
            const hardConstraintsHit = ((_x = log.violations) === null || _x === void 0 ? void 0 : _x.filter(v => v.code.includes('HARD')).length) || 0;
            const softConstraintsHit = ((_y = log.violations) === null || _y === void 0 ? void 0 : _y.filter(v => v.code.includes('SOFT')).length) || 0;
            if (hardConstraintsHit > 0) {
                this.observabilityService.recordHardConstraintsHit(traceRequestId, hardConstraintsHit);
            }
            if (softConstraintsHit > 0) {
                this.observabilityService.recordSoftConstraintsHit(traceRequestId, softConstraintsHit);
            }
            const repairActionCount = ((_z = log.chosenActions) === null || _z === void 0 ? void 0 : _z.length) || 0;
            if (repairActionCount > 0) {
                this.observabilityService.recordRepairActionCount(traceRequestId, repairActionCount);
            }
            this.observabilityService.completeTrace(traceRequestId);
        }
        let readiness;
        const readinessAgent = this.getReadinessAgent();
        if (readinessAgent && selectedRouteDirection) {
            try {
                const countryCode = this.extractCountryCode(state.context.destination);
                const month = this.extractMonth(state.context.startDate);
                const demEvidence = [];
                if (demEvidenceResult === null || demEvidenceResult === void 0 ? void 0 : demEvidenceResult.segmentEvidences) {
                    for (const evidence of demEvidenceResult.segmentEvidences) {
                        demEvidence.push({
                            segmentId: evidence.segmentId,
                            elevationProfile: evidence.elevationProfile || [],
                            cumulativeAscent: evidence.cumulativeAscent || 0,
                            maxSlopePct: evidence.maxSlopePct || 0,
                            rollingAscent3Days: evidence.rollingAscent3Days || 0,
                            fatigueIndex: evidence.fatigueIndex || 0,
                            violation: evidence.violation || 'NONE',
                            explanation: evidence.explanation || '',
                            metadata: evidence.metadata || {},
                        });
                    }
                }
                const physical = {
                    demEvidence,
                    roadStates: [],
                    hazardZones: [],
                    ferryStates: [],
                    countryCode,
                    month,
                };
                const human = (0, human_capability_model_1.createHumanCapabilityModelFromProfile)(`user_${state.context.userId || 'anonymous'}`, {
                    pace: state.context.preferences.pace === 'relaxed' ? 'slow' :
                        state.context.preferences.pace === 'intense' ? 'fast' : 'normal',
                    fitness: 'medium',
                    riskTolerance: state.context.preferences.riskTolerance === 'low' ? 'low' :
                        state.context.preferences.riskTolerance === 'high' ? 'high' : 'medium',
                });
                const routeDirection = {
                    ...selectedRouteDirection.routeDirection,
                };
                const worldContextForReadiness = {
                    physical,
                    human,
                    routeDirection,
                };
                readiness = readinessAgent.run(worldContextForReadiness, finalPlan);
                this.logger.log(`生成准备度检查清单: ${readiness.items.length} 项`);
            }
            catch (error) {
                this.logger.warn(`准备度检查清单生成失败: ${error}`);
            }
        }
        if (this.conflictResolver) {
            try {
                const constraintDSL = (_0 = state.policies) === null || _0 === void 0 ? void 0 : _0.constraintDSL;
                if (constraintDSL) {
                    const conflictResult = await this.conflictResolver.detectAndExplainConflicts(constraintDSL, finalPlan, state);
                    if (conflictResult.has_conflicts) {
                        log.conflicts = conflictResult.conflicts;
                        this.logger.log(`检测到 ${conflictResult.conflicts.length} 个约束冲突: critical=${conflictResult.critical_count}, high=${conflictResult.high_count}, medium=${conflictResult.medium_count}, low=${conflictResult.low_count}`);
                    }
                }
            }
            catch (error) {
                this.logger.warn(`约束冲突检测失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return { plan: finalPlan, log, readiness };
    }
    async generateMultiplePlans(state, requestId) {
        var _a;
        if (!this.multiPlanGenerator) {
            throw new Error('MultiPlanGenerator is required for multi-plan generation');
        }
        const constraintDSL = (_a = state.policies) === null || _a === void 0 ? void 0 : _a.constraintDSL;
        if (!constraintDSL) {
            throw new Error('ConstraintDSL is required for multi-plan generation');
        }
        const variants = await this.multiPlanGenerator.generateMultiplePlans(state, constraintDSL);
        const log = {
            runId: requestId || `multi_plan_${Date.now()}`,
            at: new Date().toISOString(),
            trigger: 'initial_generate',
            plannerVersion: '1.0.0',
            strategyMix: ['abu', 'drdre', 'neptune'],
            inputDigest: {
                destination: state.context.destination,
                startDate: state.context.startDate,
                durationDays: state.context.durationDays,
                signalUpdatedAt: state.signals.lastUpdatedAt || new Date().toISOString(),
            },
            chosenActions: [],
            explanation: `生成了 ${variants.length} 个方案变体：${variants.map(v => v.id).join(', ')}`,
        };
        return { variants, log };
    }
    async repairPlan(state, plan, trigger = 'signal_update') {
        var _a;
        if (!state || !state.context) {
            throw new Error('Invalid state: state and state.context are required');
        }
        if (!plan) {
            throw new Error('Invalid plan: plan is required');
        }
        const now = new Date().toISOString();
        const riskWeights = new Map();
        if (this.demRiskScoringService) {
            for (const date of Object.keys(state.candidatesByDate)) {
                const candidates = state.candidatesByDate[date] || [];
                for (const activity of candidates) {
                    try {
                        const riskWeight = await this.demRiskScoringService.getRiskWeightForNeptune(activity);
                        riskWeights.set(activity.id, riskWeight);
                    }
                    catch (error) {
                        this.logger.warn(`计算活动 ${activity.id} 风险权重失败: ${error}`);
                    }
                }
            }
        }
        let demEvidenceResult;
        if (this.demDecisionEvidenceService) {
            try {
                const routeSegmentation = state.routeSegmentation;
                const routeDirectionData = (_a = state.selectedRouteDirection) === null || _a === void 0 ? void 0 : _a.routeDirection;
                demEvidenceResult = await this.demDecisionEvidenceService.generateEvidencePipeline(plan, routeDirectionData, routeSegmentation);
                this.logger.log(`修复前 DEM决策证据生成完成：${demEvidenceResult.segmentEvidences.length}个路段证据，` +
                    `HARD违规: ${demEvidenceResult.hasHardViolation}`);
                const validation = this.demDecisionEvidenceService.validatePlanHasEvidence(plan, demEvidenceResult.segmentEvidences);
                if (!validation.valid) {
                    this.logger.warn(`Neptune 修复前验证失败: ${validation.reason}。Neptune 不能修复没有 DEM 证据的路径。`);
                }
                const segmentsWithHardViolation = demEvidenceResult.segmentEvidences.filter(e => e.violation === 'HARD');
                for (const evidence of segmentsWithHardViolation) {
                    this.logger.warn(`Neptune 不能修复 segment ${evidence.segmentId}: 存在硬约束违反 - ${evidence.explanation}`);
                }
            }
            catch (error) {
                this.logger.warn(`修复前 DEM决策证据生成失败: ${error}`);
            }
        }
        else if (this.demEvidencePipeline) {
            try {
                const userId = state.context.userId;
                const decisionParams = userId && this.decisionParamsInjector
                    ? await this.decisionParamsInjector.getDecisionParamsForUser(userId)
                    : null;
                const userConstraints = decisionParams ? {
                    maxDailyAscentM: decisionParams.constraints.maxDailyAscentM,
                    maxElevationM: decisionParams.constraints.maxElevationM,
                    maxSlopePct: decisionParams.constraints.maxSlopePct,
                    rollingAscent3DaysThreshold: 2000,
                } : undefined;
                demEvidenceResult = await this.demEvidencePipeline.generateEvidenceForPlan(plan, userConstraints);
            }
            catch (error) {
                this.logger.warn(`修复前 DEM evidence 生成失败: ${error}`);
            }
        }
        if (this.demEvidenceEnforcer && demEvidenceResult) {
            const segmentsRequiringRepair = this.demEvidenceEnforcer.getSegmentsRequiringRepair(demEvidenceResult);
            for (const segment of segmentsRequiringRepair) {
                const canRepair = this.demEvidenceEnforcer.canNeptuneRepairSegment(segment.segmentId, demEvidenceResult);
                if (!canRepair.allowed) {
                    this.logger.warn(`Neptune 不能修复 segment ${segment.segmentId}: ${canRepair.reason}`);
                }
            }
        }
        const repaired = (0, neptune_1.neptuneRepairPlan)(state, plan, riskWeights);
        const log = {
            runId: `run_${Date.now()}`,
            at: now,
            trigger,
            plannerVersion: plan.version,
            strategyMix: ['neptune'],
            inputDigest: {
                destination: state.context.destination,
                startDate: state.context.startDate,
                durationDays: state.context.durationDays,
                signalUpdatedAt: state.signals.lastUpdatedAt,
            },
            violations: repaired.triggers.map(t => ({
                code: t.code,
                date: t.date,
                slotId: t.slotId,
                details: t.details,
            })),
            chosenActions: repaired.changedSlotIds.map(id => ({
                actionType: 'swap',
                reasonCodes: ['MIN_EDIT_REPAIR'],
                payload: { slotId: id },
            })),
            diff: {
                changedSlots: repaired.changedSlotIds.length,
                movedSlots: 0,
                removedSlots: 0,
                addedSlots: 0,
                editDistanceScore: repaired.changedSlotIds.length,
            },
            explanation: repaired.explanation,
            demEvidence: demEvidenceResult ? {
                segmentEvidences: demEvidenceResult.segmentEvidences.map(e => ({
                    segmentId: e.segmentId,
                    violation: e.violation,
                    explanation: e.explanation,
                })),
                hasHardViolation: demEvidenceResult.hasHardViolation,
                hasSoftViolation: demEvidenceResult.hasSoftViolation,
                rollingFatigue: demEvidenceResult.rollingFatigue ? {
                    detected: demEvidenceResult.rollingFatigue.detected,
                    startDay: demEvidenceResult.rollingFatigue.startDay,
                    endDay: demEvidenceResult.rollingFatigue.endDay,
                    suggestedAction: demEvidenceResult.rollingFatigue.suggestedAction,
                    explanation: demEvidenceResult.rollingFatigue.explanation,
                } : undefined,
                canProceed: demEvidenceResult.canProceed,
            } : undefined,
        };
        return { plan: repaired.plan, log };
    }
    extractCountryCode(destination) {
        if (destination.startsWith('CN_')) {
            return destination.split('_')[0] + '_' + destination.split('_')[1];
        }
        if (destination.includes('-')) {
            return destination.split('-')[0];
        }
        if (destination.includes('_')) {
            const parts = destination.split('_');
            return parts[0];
        }
        return destination.substring(0, 2).toUpperCase();
    }
    extractMonth(date) {
        const parts = date.split('-');
        if (parts.length >= 2) {
            return parseInt(parts[1], 10);
        }
        return new Date().getMonth() + 1;
    }
    extractPreferences(preferences) {
        const tags = [];
        if (preferences.intents && typeof preferences.intents === 'object') {
            Object.keys(preferences.intents).forEach(key => {
                if (preferences.intents[key] > 0.5) {
                    tags.push(key);
                }
            });
        }
        return tags;
    }
    injectConstraints(state, constraints) {
        if (!state.policies) {
            state.policies = {};
        }
        const policies = state.policies;
        const pace = state.context.preferences.pace || 'moderate';
        const policyProfile = (0, objective_config_1.getPolicyProfile)(pace);
        policies.objectiveWeights = policyProfile.objectiveWeights;
        policies.abuConfig = policyProfile.abuConfig;
        policies.drdreConfig = policyProfile.drdreConfig;
        if (this.constraintDSLCompiler) {
            try {
                const compiled = this.constraintDSLCompiler.compile(constraints, state);
                policies.hardConstraints = {
                    ...policies.hardConstraints,
                    ...compiled.hardConstraints,
                };
                policies.softConstraints = {
                    ...policies.softConstraints,
                    ...compiled.softConstraints,
                };
                policies.objectives = {
                    ...policies.objectives,
                    ...compiled.objectives,
                };
                if (constraints.hard_constraints || constraints.soft_constraints) {
                    policies.constraintDSL = constraints;
                }
                this.logger.log(`使用DSL编译器注入了约束 (pace=${pace}): hard=${JSON.stringify(policies.hardConstraints)}, soft=${JSON.stringify(policies.softConstraints)}, objectives=${JSON.stringify(policies.objectives)}`);
                return;
            }
            catch (error) {
                this.logger.warn(`DSL编译失败，回退到旧逻辑: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const hardConstraints = constraints.hard || {};
        const softConstraints = constraints.soft || {};
        const objectives = constraints.objectives || {};
        const paceMultiplier = this.getPaceMultiplier(pace);
        if (hardConstraints.maxDailyRapidAscentM !== undefined) {
            policies.hardConstraints = policies.hardConstraints || {};
            policies.hardConstraints.maxDailyRapidAscentM = hardConstraints.maxDailyRapidAscentM;
        }
        if (hardConstraints.maxSlopePct !== undefined) {
            policies.hardConstraints = policies.hardConstraints || {};
            policies.hardConstraints.maxSlopePct = hardConstraints.maxSlopePct;
        }
        if (hardConstraints.rapidAscentForbidden !== undefined) {
            policies.hardConstraints = policies.hardConstraints || {};
            policies.hardConstraints.rapidAscentForbidden = hardConstraints.rapidAscentForbidden;
        }
        if (hardConstraints.requiresPermit !== undefined) {
            policies.hardConstraints = policies.hardConstraints || {};
            policies.hardConstraints.requiresPermit = hardConstraints.requiresPermit;
        }
        if (hardConstraints.requiresGuide !== undefined) {
            policies.hardConstraints = policies.hardConstraints || {};
            policies.hardConstraints.requiresGuide = hardConstraints.requiresGuide;
        }
        if (softConstraints.maxDailyAscentM !== undefined) {
            policies.softConstraints = policies.softConstraints || {};
            policies.softConstraints.maxDailyAscentM = Math.round(softConstraints.maxDailyAscentM * paceMultiplier.ascent);
        }
        if (softConstraints.maxElevationM !== undefined) {
            policies.softConstraints = policies.softConstraints || {};
            policies.softConstraints.maxElevationM = Math.round(softConstraints.maxElevationM * paceMultiplier.elevation);
        }
        if (softConstraints.bufferTimeMin !== undefined) {
            policies.softConstraints = policies.softConstraints || {};
            policies.softConstraints.bufferTimeMin = Math.round(softConstraints.bufferTimeMin * paceMultiplier.buffer);
        }
        if (objectives.preferViewpoints !== undefined) {
            policies.objectives = policies.objectives || {};
            policies.objectives.preferViewpoints = objectives.preferViewpoints;
        }
        if (objectives.preferHotSpring !== undefined) {
            policies.objectives = policies.objectives || {};
            policies.objectives.preferHotSpring = objectives.preferHotSpring;
        }
        if (objectives.preferPhotography !== undefined) {
            policies.objectives = policies.objectives || {};
            policies.objectives.preferPhotography = objectives.preferPhotography;
        }
        if (!constraints.hard && !constraints.soft) {
            if (constraints.maxElevationM) {
                policies.softConstraints = policies.softConstraints || {};
                policies.softConstraints.maxElevationM = Math.round(constraints.maxElevationM * paceMultiplier.elevation);
            }
            if (constraints.maxDailyAscentM) {
                policies.softConstraints = policies.softConstraints || {};
                policies.softConstraints.maxDailyAscentM = Math.round(constraints.maxDailyAscentM * paceMultiplier.ascent);
            }
            if (constraints.maxSlope) {
                policies.hardConstraints = policies.hardConstraints || {};
                policies.hardConstraints.maxSlopePct = constraints.maxSlope;
            }
            if (constraints.rapidAscentForbidden) {
                policies.hardConstraints = policies.hardConstraints || {};
                policies.hardConstraints.rapidAscentForbidden = constraints.rapidAscentForbidden;
            }
        }
        this.logger.log(`注入了约束 (pace=${pace}): hard=${JSON.stringify(policies.hardConstraints)}, soft=${JSON.stringify(policies.softConstraints)}, objectives=${JSON.stringify(policies.objectives)}`);
    }
    getPaceMultiplier(pace) {
        switch (pace) {
            case 'relaxed':
                return {
                    ascent: 0.7,
                    elevation: 0.8,
                    buffer: 1.5,
                };
            case 'intense':
                return {
                    ascent: 1.2,
                    elevation: 1.1,
                    buffer: 0.7,
                };
            case 'moderate':
            default:
                return {
                    ascent: 1.0,
                    elevation: 1.0,
                    buffer: 1.0,
                };
        }
    }
    mergeCandidatePois(state, routePois) {
        for (let i = 0; i < state.context.durationDays; i++) {
            const date = addDays(state.context.startDate, i);
            if (!state.candidatesByDate[date]) {
                state.candidatesByDate[date] = [];
            }
            for (const poi of routePois) {
                if (!state.candidatesByDate[date].find(c => c.id === poi.id)) {
                    state.candidatesByDate[date].push(poi);
                }
            }
        }
        this.logger.log(`合并了 ${routePois.length} 个路线方向 POI 到候选池`);
    }
    computeDayTerrainFacts(selectedRouteDirection, keptActivities, slots, routeSegmentation) {
        var _a, _b, _c, _d, _e, _f;
        const constraints = (selectedRouteDirection === null || selectedRouteDirection === void 0 ? void 0 : selectedRouteDirection.constraints) || ((_a = selectedRouteDirection === null || selectedRouteDirection === void 0 ? void 0 : selectedRouteDirection.routeDirection) === null || _a === void 0 ? void 0 : _a.constraints);
        const maxElevation = (constraints === null || constraints === void 0 ? void 0 : constraints.maxElevationM) || ((_b = constraints === null || constraints === void 0 ? void 0 : constraints.soft) === null || _b === void 0 ? void 0 : _b.maxElevationM) || ((_c = constraints === null || constraints === void 0 ? void 0 : constraints.hard) === null || _c === void 0 ? void 0 : _c.maxElevationM);
        const maxDailyAscent = (constraints === null || constraints === void 0 ? void 0 : constraints.maxDailyAscentM) || ((_d = constraints === null || constraints === void 0 ? void 0 : constraints.soft) === null || _d === void 0 ? void 0 : _d.maxDailyAscentM);
        let minElevation;
        let maxElevationFromPois;
        for (const activity of keptActivities) {
            const elevation = ((_e = activity.metadata) === null || _e === void 0 ? void 0 : _e.elevationM) || ((_f = activity.metadata) === null || _f === void 0 ? void 0 : _f.altitudeM);
            if (elevation !== undefined) {
                if (minElevation === undefined || elevation < minElevation) {
                    minElevation = elevation;
                }
                if (maxElevationFromPois === undefined || elevation > maxElevationFromPois) {
                    maxElevationFromPois = elevation;
                }
            }
        }
        if (routeSegmentation && routeSegmentation.elevationProfile && routeSegmentation.elevationProfile.length > 0) {
            const elevations = routeSegmentation.elevationProfile.map((p) => p.elevation);
            const segMaxElevation = Math.max(...elevations);
            const segMinElevation = Math.min(...elevations);
            if (!maxElevationFromPois || segMaxElevation > maxElevationFromPois) {
                maxElevationFromPois = segMaxElevation;
            }
            if (!minElevation || segMinElevation < minElevation) {
                minElevation = segMinElevation;
            }
        }
        const finalMaxElevation = maxElevation || maxElevationFromPois;
        let totalAscent;
        if (maxDailyAscent) {
            totalAscent = maxDailyAscent;
        }
        else if (routeSegmentation) {
            totalAscent = routeSegmentation.totalAscent;
        }
        else if (finalMaxElevation && minElevation) {
            totalAscent = finalMaxElevation - minElevation;
        }
        let effortLevel;
        if (maxDailyAscent && maxDailyAscent > 1000) {
            effortLevel = 'CHALLENGE';
        }
        else if (maxDailyAscent && maxDailyAscent > 500) {
            effortLevel = 'MODERATE';
        }
        else if (maxDailyAscent && maxDailyAscent <= 500) {
            effortLevel = 'RELAX';
        }
        const riskFlags = [];
        if (finalMaxElevation && finalMaxElevation > 3500) {
            riskFlags.push({
                type: 'HIGH_ALTITUDE',
                severity: 'HIGH',
                message: `最高海拔 ${finalMaxElevation}m，存在高反风险`,
            });
        }
        if (maxDailyAscent && maxDailyAscent > 500) {
            riskFlags.push({
                type: 'RAPID_ASCENT',
                severity: maxDailyAscent > 1000 ? 'HIGH' : 'MEDIUM',
                message: `每日爬升 ${maxDailyAscent}m，需注意适应`,
            });
        }
        if (routeSegmentation) {
            if (routeSegmentation.steepSections && routeSegmentation.steepSections.length > 0) {
                const highSeveritySteepSections = routeSegmentation.steepSections.filter((s) => s.severity === 'HIGH');
                if (highSeveritySteepSections.length > 0) {
                    riskFlags.push({
                        type: 'STEEP_SECTIONS',
                        severity: 'HIGH',
                        message: `路线包含 ${highSeveritySteepSections.length} 个高难度过陡段（平均坡度>25%）`,
                    });
                }
                else {
                    const mediumSeveritySteepSections = routeSegmentation.steepSections.filter((s) => s.severity === 'MEDIUM');
                    if (mediumSeveritySteepSections.length > 0) {
                        riskFlags.push({
                            type: 'STEEP_SECTIONS',
                            severity: 'MEDIUM',
                            message: `路线包含 ${mediumSeveritySteepSections.length} 个中等难度过陡段（平均坡度>20%）`,
                        });
                    }
                }
            }
            if (routeSegmentation.mandatoryRestPoints && routeSegmentation.mandatoryRestPoints.length > 0) {
                const highSeverityRestPoints = routeSegmentation.mandatoryRestPoints.filter((r) => r.severity === 'HIGH');
                if (highSeverityRestPoints.length > 0) {
                    riskFlags.push({
                        type: 'MANDATORY_REST_POINTS',
                        severity: 'HIGH',
                        message: `路线包含 ${highSeverityRestPoints.length} 个强制休息点（高海拔或连续上升>2000m）`,
                    });
                }
            }
            if (routeSegmentation.energyBreakpoints && routeSegmentation.energyBreakpoints.length > 0) {
                riskFlags.push({
                    type: 'ENERGY_BREAKPOINTS',
                    severity: 'MEDIUM',
                    message: `路线包含 ${routeSegmentation.energyBreakpoints.length} 个体力断点，建议合理安排休息`,
                });
            }
        }
        if (!finalMaxElevation && !totalAscent) {
            return undefined;
        }
        return {
            maxElevation: finalMaxElevation,
            totalAscent,
            minElevation,
            effortLevel,
            riskFlags: riskFlags.length > 0 ? riskFlags : undefined,
        };
    }
    filterPoolForComplianceDowngrade(pool) {
        return pool.filter(candidate => {
            const tags = candidate.intentTags || [];
            const category = candidate.category || '';
            const keepTags = ['城市', '文化', '博物馆', '餐厅', '购物', 'city', 'culture', 'museum', 'restaurant'];
            const excludeTags = ['徒步', '登山', '高海拔', '限制区域', 'hiking', 'mountaineering', 'high_altitude'];
            const hasKeepTag = keepTags.some(tag => tags.includes(tag) || category.toLowerCase().includes(tag.toLowerCase()));
            const hasExcludeTag = excludeTags.some(tag => tags.includes(tag) || category.toLowerCase().includes(tag.toLowerCase()));
            return hasKeepTag && !hasExcludeTag;
        });
    }
    inferEffortLevel(budget) {
        const ratio = budget.totalEnergyCost / budget.maxEnergyCost;
        if (ratio >= 0.9) {
            return 'EXTREME';
        }
        else if (ratio >= 0.7) {
            return 'CHALLENGE';
        }
        else if (ratio >= 0.5) {
            return 'MODERATE';
        }
        else {
            return 'RELAX';
        }
    }
};
exports.TripDecisionEngineService = TripDecisionEngineService;
exports.TripDecisionEngineService = TripDecisionEngineService = TripDecisionEngineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __param(9, (0, common_1.Optional)()),
    __param(10, (0, common_1.Optional)()),
    __param(11, (0, common_1.Optional)()),
    __param(12, (0, common_1.Optional)()),
    __param(13, (0, common_1.Optional)()),
    __param(14, (0, common_1.Optional)()),
    __param(15, (0, common_1.Optional)()),
    __param(16, (0, common_1.Optional)()),
    __param(17, (0, common_1.Optional)()),
    __param(18, (0, common_1.Optional)()),
    __param(19, (0, common_1.Optional)()),
    __param(20, (0, common_1.Optional)()),
    __param(21, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [sense_tools_adapter_1.SenseToolsAdapter,
        core_1.ModuleRef,
        route_direction_selector_service_1.RouteDirectionSelectorService,
        route_direction_poi_generator_service_1.RouteDirectionPoiGeneratorService,
        route_direction_observability_service_1.RouteDirectionObservabilityService,
        compliance_plugin_service_1.CompliancePluginService,
        transport_plugin_service_1.TransportPluginService,
        dem_daily_energy_service_1.DEMDailyEnergyService,
        dem_route_segmentation_service_1.DEMRouteSegmentationService,
        dem_risk_scoring_service_1.DEMRiskScoringService,
        dem_evidence_chain_service_1.DEMEvidenceChainService,
        decision_params_injector_service_1.DecisionParamsInjectorService,
        memory_service_1.MemoryService,
        dry_run_planner_service_1.DryRunPlannerService,
        dem_decision_evidence_pipeline_service_1.DemDecisionEvidencePipelineService,
        dem_evidence_enforcer_service_1.DemEvidenceEnforcerService,
        dem_decision_evidence_service_1.DemDecisionEvidenceService,
        strategy_orchestrator_service_1.StrategyOrchestratorService,
        plan_converter_service_1.PlanConverterService,
        constraint_dsl_compiler_service_1.ConstraintDSLCompiler,
        constraint_conflict_resolver_service_1.ConstraintConflictResolver,
        multi_plan_generator_service_1.MultiPlanGenerator])
], TripDecisionEngineService);
function addDays(date, days) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
//# sourceMappingURL=trip-decision-engine.service.js.map