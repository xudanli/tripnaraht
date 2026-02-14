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
var PlanningWorkbenchAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningWorkbenchAgentService = void 0;
const common_1 = require("@nestjs/common");
const context_build_skill_1 = require("../../skills/context/context-build.skill");
const plan_architect_generate_skeleton_skill_1 = require("../../skills/plan/architect/plan-architect-generate-skeleton.skill");
const plan_architect_compare_options_skill_1 = require("../../skills/plan/architect/plan-architect-compare-options.skill");
const plan_architect_commit_option_skill_1 = require("../../skills/plan/architect/plan-architect-commit-option.skill");
const plan_budget_estimate_baseline_skill_1 = require("../../skills/plan/budget/plan-budget-estimate-baseline.skill");
const plan_budget_detect_overrun_skill_1 = require("../../skills/plan/budget/plan-budget-detect-overrun.skill");
const plan_transit_build_transfer_graph_skill_1 = require("../../skills/plan/transit/plan-transit-build-transfer-graph.skill");
const plan_pace_compute_time_windows_skill_1 = require("../../skills/plan/pace/plan-pace-compute-time-windows.skill");
const plan_pace_fatigue_score_skill_1 = require("../../skills/plan/pace/plan-pace-fatigue-score.skill");
const plan_gate_precheck_skill_1 = require("../../skills/plan/gate/plan-gate-precheck.skill");
const plan_gate_run_three_guardians_skill_1 = require("../../skills/plan/gate/plan-gate-run-three-guardians.skill");
const plan_constraints_detect_conflicts_skill_1 = require("../../skills/plan/constraints/plan-constraints-detect-conflicts.skill");
const plan_log_append_decision_skill_1 = require("../../skills/plan/log/plan-log-append-decision.skill");
const persona_shell_service_1 = require("./persona-shell.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const state_store_service_1 = require("../../agent/infra/state-store.service");
const dem_effort_metadata_service_1 = require("../../trips/dem/services/dem-effort-metadata.service");
const geo_facts_service_1 = require("../../trips/readiness/services/geo-facts.service");
const geo_check_hazard_zones_skill_1 = require("../../skills/geo/geo-check-hazard-zones.skill");
const trip_run_manager_service_1 = require("./trip-run-manager.service");
const decision_draft_storage_service_1 = require("../../decision-draft/storage/decision-draft-storage.service");
const geo_agent_service_1 = require("./domain-agents/geo-agent.service");
const weather_agent_service_1 = require("./domain-agents/weather-agent.service");
const cost_agent_service_1 = require("./domain-agents/cost-agent.service");
const experience_agent_service_1 = require("./domain-agents/experience-agent.service");
const orchestration_utils_1 = require("./orchestration-utils");
let PlanningWorkbenchAgentService = PlanningWorkbenchAgentService_1 = class PlanningWorkbenchAgentService {
    constructor(contextBuild, architectGenerateSkeleton, architectCompareOptions, architectCommitOption, budgetEstimateBaseline, budgetDetectOverrun, transitBuildTransferGraph, paceComputeTimeWindows, paceFatigueScore, gatePrecheck, gateRunThreeGuardians, constraintsDetectConflicts, logAppendDecision, personaShell, prisma, stateStore, tripRunManager, decisionDraftStorage, geoAgent, weatherAgent, costAgent, experienceAgent, demEffortMetadataService, geoFactsService, geoCheckHazardZonesSkill) {
        this.contextBuild = contextBuild;
        this.architectGenerateSkeleton = architectGenerateSkeleton;
        this.architectCompareOptions = architectCompareOptions;
        this.architectCommitOption = architectCommitOption;
        this.budgetEstimateBaseline = budgetEstimateBaseline;
        this.budgetDetectOverrun = budgetDetectOverrun;
        this.transitBuildTransferGraph = transitBuildTransferGraph;
        this.paceComputeTimeWindows = paceComputeTimeWindows;
        this.paceFatigueScore = paceFatigueScore;
        this.gatePrecheck = gatePrecheck;
        this.gateRunThreeGuardians = gateRunThreeGuardians;
        this.constraintsDetectConflicts = constraintsDetectConflicts;
        this.logAppendDecision = logAppendDecision;
        this.personaShell = personaShell;
        this.prisma = prisma;
        this.stateStore = stateStore;
        this.tripRunManager = tripRunManager;
        this.decisionDraftStorage = decisionDraftStorage;
        this.geoAgent = geoAgent;
        this.weatherAgent = weatherAgent;
        this.costAgent = costAgent;
        this.experienceAgent = experienceAgent;
        this.demEffortMetadataService = demEffortMetadataService;
        this.geoFactsService = geoFactsService;
        this.geoCheckHazardZonesSkill = geoCheckHazardZonesSkill;
        this.logger = new common_1.Logger(PlanningWorkbenchAgentService_1.name);
        this.geoFeaturesMaxConcurrency = 2;
    }
    async execute(request) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2;
        this.logger.debug(`执行规划工作台: action=${request.userAction || 'generate'}, tripId=${request.tripId || 'none'}`);
        this.logger.debug(`技能注入状态: architectGenerateSkeleton=${!!this.architectGenerateSkeleton}, budgetEstimateBaseline=${!!this.budgetEstimateBaseline}, personaShell=${!!this.personaShell}`);
        let tripRunId = null;
        let attemptNumber = 1;
        let attemptId = null;
        if (this.tripRunManager) {
            try {
                const metadata = request.metadata || {};
                tripRunId = metadata.tripRunId || null;
                if (!tripRunId) {
                    tripRunId = await this.tripRunManager.createTripRun({
                        tripId: request.tripId || null,
                        userId: metadata.userId || null,
                        userQuery: `规划工作台: ${request.context.destination.city || request.context.destination.country}`,
                        planningPhase: 'PLANNING',
                        currentAgent: 'PlanningWorkbench',
                        metadata: {
                            userAction: request.userAction || 'generate',
                        },
                    });
                }
                if (tripRunId) {
                    this.logger.debug(`Using TripRun: ${tripRunId} for PlanningWorkbench`);
                }
            }
            catch (error) {
                this.logger.warn(`Failed to create/get TripRun: ${error.message}`);
            }
        }
        try {
            const metadata = request.metadata || {};
            const updateProgress = metadata.updateProgress;
            const taskId = metadata.taskId;
            if (updateProgress) {
                this.logger.debug(`进度更新函数已注入: taskId=${taskId || 'unknown'}`);
            }
            else {
                this.logger.debug('进度更新函数未注入（同步模式）');
            }
            let world;
            if (request.tripId && this.contextBuild) {
                this.logger.debug('构建世界模型上下文...');
                updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(5, '正在构建世界模型上下文...');
                try {
                    const contextPromise = this.contextBuild.execute({
                        tripId: request.tripId,
                        phase: 'PLANNING',
                        agent: 'PlanningWorkbench',
                        userQuery: `规划工作台: ${request.context.destination.city || request.context.destination.country}`,
                        tokenBudget: 3000,
                    });
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('构建上下文超时（10秒）')), 10000);
                    });
                    const contextResult = await Promise.race([contextPromise, timeoutPromise]);
                    this.logger.debug('世界模型上下文构建完成');
                    updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(10, '世界模型上下文构建完成');
                }
                catch (contextError) {
                    this.logger.warn(`构建上下文失败或超时: ${contextError.message}，继续执行`);
                }
            }
            else {
                updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(10, '跳过上下文构建');
            }
            let planState = request.existingPlanState || this.createInitialPlanState(request.context, request.tripId);
            const uiOutput = {};
            switch (request.userAction) {
                case 'generate':
                    if (this.architectGenerateSkeleton) {
                        this.logger.debug('开始生成行程骨架方案...');
                        updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(15, '开始生成行程骨架方案...');
                        if (tripRunId && this.tripRunManager) {
                            try {
                                attemptId = await this.tripRunManager.createTripAttempt({
                                    tripRunId,
                                    attemptNumber,
                                    planOutline: `生成行程骨架方案: ${request.context.destination.city || request.context.destination.country}`,
                                    nextActions: ['plan.architect.generateSkeleton'],
                                    metadata: {
                                        userAction: 'generate',
                                    },
                                });
                                if (attemptId) {
                                    this.logger.debug(`Created TripAttempt: ${attemptId} for generate`);
                                }
                            }
                            catch (error) {
                                this.logger.warn(`Failed to create TripAttempt: ${error.message}`);
                            }
                        }
                        try {
                            updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(20, '正在调用LLM生成骨架方案...');
                            const skeletonResult = await this.architectGenerateSkeleton.execute({
                                context: request.context,
                                tripId: request.tripId,
                                world,
                            });
                            uiOutput.skeletonOptions = skeletonResult.skeletonSet;
                            updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(40, '骨架方案生成完成，正在转换为segments...');
                            const recommendedOption = ((_a = skeletonResult.skeletonSet.options) === null || _a === void 0 ? void 0 : _a.find(opt => { var _a; return opt.id === ((_a = skeletonResult.skeletonSet.recommendation) === null || _a === void 0 ? void 0 : _a.optionId); })) || ((_b = skeletonResult.skeletonSet.options) === null || _b === void 0 ? void 0 : _b[0]);
                            if (recommendedOption && recommendedOption.dayThemes && recommendedOption.dayThemes.length > 0) {
                                planState.itinerary.segments = recommendedOption.dayThemes.map((theme, idx) => {
                                    var _a;
                                    const dayPoi = (_a = recommendedOption.pois) === null || _a === void 0 ? void 0 : _a.find(p => p.day === theme.day);
                                    return {
                                        segmentId: `day_${theme.day}_segment_1`,
                                        dayIndex: theme.day - 1,
                                        distanceKm: 0,
                                        ascentM: 0,
                                        slopePct: 0,
                                        metadata: {
                                            theme: theme.theme,
                                            description: theme.description,
                                            day: theme.day,
                                            skeletonId: recommendedOption.id,
                                            skeletonName: recommendedOption.name,
                                            ...((dayPoi === null || dayPoi === void 0 ? void 0 : dayPoi.accommodation) && { accommodation: dayPoi.accommodation }),
                                            ...((dayPoi === null || dayPoi === void 0 ? void 0 : dayPoi.restaurants) && dayPoi.restaurants.length > 0 && { restaurants: dayPoi.restaurants }),
                                            ...((dayPoi === null || dayPoi === void 0 ? void 0 : dayPoi.attractions) && dayPoi.attractions.length > 0 && { attractions: dayPoi.attractions }),
                                        },
                                    };
                                });
                                this.logger.debug(`已将骨架方案转换为 ${planState.itinerary.segments.length} 个 segments，包含POI信息`);
                                const segmentsWithPoi = planState.itinerary.segments.filter(seg => {
                                    var _a, _b, _c, _d, _e, _f;
                                    const hasAccommodation = (_b = (_a = seg.metadata) === null || _a === void 0 ? void 0 : _a.accommodation) === null || _b === void 0 ? void 0 : _b.coordinates;
                                    const hasRestaurants = (_d = (_c = seg.metadata) === null || _c === void 0 ? void 0 : _c.restaurants) === null || _d === void 0 ? void 0 : _d.some((r) => { var _a; return (_a = r.poi) === null || _a === void 0 ? void 0 : _a.coordinates; });
                                    const hasAttractions = (_f = (_e = seg.metadata) === null || _e === void 0 ? void 0 : _e.attractions) === null || _f === void 0 ? void 0 : _f.some((a) => a.coordinates);
                                    return hasAccommodation || hasRestaurants || hasAttractions;
                                });
                                this.logger.debug(`Segments中有POI坐标的数量: ${segmentsWithPoi.length}/${planState.itinerary.segments.length}`);
                            }
                            else {
                                this.logger.warn(`推荐方案为空或没有dayThemes，无法转换为segments`);
                            }
                            if (planState.itinerary.segments.length > 0) {
                                this.logger.debug(`开始执行阶段2.5: 填充DEM地形数据和地理特征（${planState.itinerary.segments.length} 个segments）`);
                                updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(60, `正在填充DEM地形数据和地理特征（${planState.itinerary.segments.length} 个segments）...`);
                                await this.enrichSegmentsWithGeographicData(planState.itinerary.segments, request.context, updateProgress);
                            }
                            else {
                                this.logger.warn(`跳过阶段2.5: segments为空，无法填充DEM和地理特征`);
                                updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(80, '跳过DEM数据填充（segments为空）');
                            }
                            if (skeletonResult.skeletonSet.options && skeletonResult.skeletonSet.options.length > 1) {
                                this.logger.debug(`开始执行阶段2.6: 记录决策追溯链（${skeletonResult.skeletonSet.options.length} 个方案）`);
                                updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(85, '正在记录决策追溯链...');
                                await this.recordDecisionTraceAndExclusions(planState, skeletonResult.skeletonSet, recommendedOption, request.context);
                                updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(90, '决策追溯链记录完成');
                            }
                            else {
                                this.logger.debug(`跳过阶段2.6: 方案数量不足（${((_c = skeletonResult.skeletonSet.options) === null || _c === void 0 ? void 0 : _c.length) || 0} 个）`);
                                updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(90, '跳过决策追溯链记录（方案数量不足）');
                            }
                            if (attemptId && this.tripRunManager) {
                                try {
                                    await this.tripRunManager.completeTripAttempt(attemptId, `成功生成 ${((_d = skeletonResult.skeletonSet.options) === null || _d === void 0 ? void 0 : _d.length) || 0} 个骨架方案`, {
                                        skeletonSet: {
                                            optionCount: ((_e = skeletonResult.skeletonSet.options) === null || _e === void 0 ? void 0 : _e.length) || 0,
                                            recommendation: skeletonResult.skeletonSet.recommendation,
                                        },
                                    });
                                }
                                catch (error) {
                                    this.logger.warn(`Failed to update TripAttempt to COMPLETED: ${error.message}`);
                                }
                            }
                            const isDefault = (_f = skeletonResult.skeletonSet.options) === null || _f === void 0 ? void 0 : _f.some(opt => opt.id === 'default_1' || opt.name === '默认方案');
                            if (isDefault) {
                                this.logger.warn(`生成骨架方案失败，已使用默认方案（${((_g = skeletonResult.skeletonSet.options) === null || _g === void 0 ? void 0 : _g.length) || 0} 个方案）`);
                            }
                            else {
                                this.logger.debug(`行程骨架方案生成完成: ${((_h = skeletonResult.skeletonSet.options) === null || _h === void 0 ? void 0 : _h.length) || 0} 个方案`);
                            }
                        }
                        catch (skeletonError) {
                            if (attemptId && this.tripRunManager) {
                                try {
                                    await this.tripRunManager.failTripAttempt(attemptId, `生成骨架方案失败: ${skeletonError.message}`);
                                }
                                catch (error) {
                                    this.logger.warn(`Failed to update TripAttempt to FAILED: ${error.message}`);
                                }
                            }
                            const isTimeout = ((_j = skeletonError.message) === null || _j === void 0 ? void 0 : _j.includes('超时')) || ((_k = skeletonError.message) === null || _k === void 0 ? void 0 : _k.includes('timeout'));
                            if (isTimeout) {
                                this.logger.warn(`生成骨架方案超时: ${skeletonError.message}，技能层应已返回默认方案`);
                            }
                            else {
                                this.logger.error(`生成骨架方案失败: ${skeletonError.message}，技能层应已返回默认方案`);
                            }
                            if (!uiOutput.skeletonOptions) {
                                const defaultDayThemes = Array.from({ length: request.context.days }, (_, i) => ({
                                    day: i + 1,
                                    theme: `第${i + 1}天`,
                                    description: `在${request.context.destination.city || request.context.destination.country}的第${i + 1}天行程`,
                                }));
                                uiOutput.skeletonOptions = {
                                    options: [{
                                            id: 'default_1',
                                            name: '默认方案',
                                            dayThemes: defaultDayThemes,
                                            anchors: [],
                                            transferDays: [],
                                            rationale: {
                                                philosophy: '默认方案（生成失败时使用）',
                                                tradeoffs: [],
                                                strengths: [],
                                                weaknesses: [],
                                            },
                                        }],
                                    recommendation: {
                                        optionId: 'default_1',
                                        reason: '生成失败，使用默认方案',
                                    },
                                };
                                planState.itinerary.segments = defaultDayThemes.map((theme, idx) => ({
                                    segmentId: `day_${theme.day}_segment_1`,
                                    dayIndex: theme.day - 1,
                                    distanceKm: 0,
                                    ascentM: 0,
                                    slopePct: 0,
                                    metadata: {
                                        theme: theme.theme,
                                        description: theme.description,
                                        day: theme.day,
                                        skeletonId: 'default_1',
                                        skeletonName: '默认方案',
                                    },
                                }));
                                this.logger.debug(`已将默认骨架方案转换为 ${planState.itinerary.segments.length} 个 segments`);
                            }
                        }
                    }
                    else {
                        this.logger.warn('PlanArchitectGenerateSkeletonSkill 未注入，跳过生成骨架方案');
                    }
                    break;
                case 'compare':
                    if (this.architectCompareOptions) {
                        this.logger.debug('开始对比行程骨架方案...');
                        if (tripRunId && this.tripRunManager) {
                            try {
                                attemptId = await this.tripRunManager.createTripAttempt({
                                    tripRunId,
                                    attemptNumber,
                                    planOutline: `对比行程骨架方案`,
                                    nextActions: ['plan.architect.compareOptions'],
                                    metadata: {
                                        userAction: 'compare',
                                    },
                                });
                                if (attemptId) {
                                    this.logger.debug(`Created TripAttempt: ${attemptId} for compare`);
                                }
                            }
                            catch (error) {
                                this.logger.warn(`Failed to create TripAttempt: ${error.message}`);
                            }
                        }
                        try {
                            const skeletonSet = request.skeletonOptions ||
                                uiOutput.skeletonOptions ||
                                ((_l = planState.metadata) === null || _l === void 0 ? void 0 : _l.skeletonOptions);
                            if (!skeletonSet || !skeletonSet.options || skeletonSet.options.length < 2) {
                                this.logger.warn(`对比方案失败: 需要至少2个方案，当前有 ${((_m = skeletonSet === null || skeletonSet === void 0 ? void 0 : skeletonSet.options) === null || _m === void 0 ? void 0 : _m.length) || 0} 个`);
                                uiOutput.confirmations = [
                                    '对比功能需要至少2个方案。请先生成多个方案后再进行对比。',
                                ];
                            }
                            else {
                                const compareResult = await this.architectCompareOptions.execute({
                                    options: skeletonSet.options,
                                    context: request.context,
                                });
                                uiOutput.comparison = compareResult.comparison;
                                if (compareResult.comparison.recommendation) {
                                    planState.metadata = {
                                        ...planState.metadata,
                                        comparison: compareResult.comparison,
                                        recommendedOptionId: compareResult.comparison.recommendation.optionId,
                                    };
                                    this.logger.debug(`对比完成，推荐方案: ${compareResult.comparison.recommendation.optionId}`);
                                }
                                if (attemptId && this.tripRunManager) {
                                    try {
                                        await this.tripRunManager.completeTripAttempt(attemptId, `成功对比 ${skeletonSet.options.length} 个方案`, {
                                            comparison: {
                                                optionCount: skeletonSet.options.length,
                                                recommendation: compareResult.comparison.recommendation,
                                            },
                                        });
                                    }
                                    catch (error) {
                                        this.logger.warn(`Failed to update TripAttempt to COMPLETED: ${error.message}`);
                                    }
                                }
                                this.logger.debug(`行程骨架方案对比完成: ${skeletonSet.options.length} 个方案`);
                            }
                        }
                        catch (compareError) {
                            this.logger.error(`对比方案失败: ${compareError.message}`, compareError.stack);
                            if (attemptId && this.tripRunManager) {
                                try {
                                    await this.tripRunManager.failTripAttempt(attemptId, `对比方案失败: ${compareError.message}`);
                                }
                                catch (error) {
                                    this.logger.warn(`Failed to update TripAttempt to FAILED: ${error.message}`);
                                }
                            }
                            uiOutput.confirmations = [
                                `对比方案时发生错误: ${compareError.message}。请重试或联系支持。`,
                            ];
                        }
                    }
                    else {
                        this.logger.warn('PlanArchitectCompareOptionsSkill 未注入，跳过对比方案');
                        uiOutput.confirmations = ['对比功能暂不可用，请稍后重试。'];
                    }
                    break;
                case 'commit':
                    if (this.architectCommitOption) {
                        this.logger.debug('开始提交行程骨架方案...');
                        if (tripRunId && this.tripRunManager) {
                            try {
                                attemptId = await this.tripRunManager.createTripAttempt({
                                    tripRunId,
                                    attemptNumber,
                                    planOutline: `提交行程骨架方案`,
                                    nextActions: ['plan.architect.commitOption'],
                                    metadata: {
                                        userAction: 'commit',
                                    },
                                });
                                if (attemptId) {
                                    this.logger.debug(`Created TripAttempt: ${attemptId} for commit`);
                                }
                            }
                            catch (error) {
                                this.logger.warn(`Failed to create TripAttempt: ${error.message}`);
                            }
                        }
                        try {
                            const selectedOptionId = request.selectedOptionId ||
                                ((_o = planState.metadata) === null || _o === void 0 ? void 0 : _o.recommendedOptionId) ||
                                ((_q = (_p = uiOutput.comparison) === null || _p === void 0 ? void 0 : _p.recommendation) === null || _q === void 0 ? void 0 : _q.optionId);
                            if (!selectedOptionId) {
                                this.logger.warn('提交方案失败: 未指定要提交的方案');
                                uiOutput.confirmations = [
                                    '请先选择一个方案进行提交。可以从对比结果中选择推荐方案，或直接指定方案ID。',
                                ];
                            }
                            else {
                                const skeletonSet = request.skeletonOptions ||
                                    uiOutput.skeletonOptions ||
                                    ((_r = planState.metadata) === null || _r === void 0 ? void 0 : _r.skeletonOptions);
                                if (!skeletonSet || !skeletonSet.options) {
                                    this.logger.warn('提交方案失败: 未找到骨架方案集');
                                    uiOutput.confirmations = [
                                        '提交方案失败: 未找到骨架方案集。请先生成方案后再提交。',
                                    ];
                                }
                                else {
                                    const selectedOption = skeletonSet.options.find((opt) => opt.id === selectedOptionId);
                                    if (!selectedOption) {
                                        this.logger.warn(`提交方案失败: 未找到方案 ${selectedOptionId}`);
                                        uiOutput.confirmations = [
                                            `提交方案失败: 未找到方案 ${selectedOptionId}。请检查方案ID是否正确。`,
                                        ];
                                    }
                                    else {
                                        const commitResult = await this.architectCommitOption.execute({
                                            selectedOption,
                                            existingPlanState: planState,
                                            context: request.context,
                                        });
                                        planState = commitResult.planState;
                                        if (selectedOption.dayThemes && selectedOption.dayThemes.length > 0) {
                                            planState.itinerary.segments = selectedOption.dayThemes.map((theme, idx) => {
                                                var _a;
                                                const dayPoi = (_a = selectedOption.pois) === null || _a === void 0 ? void 0 : _a.find((p) => p.day === theme.day);
                                                return {
                                                    segmentId: `day_${theme.day}_segment_1`,
                                                    dayIndex: theme.day - 1,
                                                    distanceKm: 0,
                                                    ascentM: 0,
                                                    slopePct: 0,
                                                    metadata: {
                                                        theme: theme.theme,
                                                        description: theme.description,
                                                        day: theme.day,
                                                        skeletonId: selectedOption.id,
                                                        skeletonName: selectedOption.name,
                                                        ...((dayPoi === null || dayPoi === void 0 ? void 0 : dayPoi.accommodation) && { accommodation: dayPoi.accommodation }),
                                                        ...((dayPoi === null || dayPoi === void 0 ? void 0 : dayPoi.restaurants) && dayPoi.restaurants.length > 0 && { restaurants: dayPoi.restaurants }),
                                                        ...((dayPoi === null || dayPoi === void 0 ? void 0 : dayPoi.attractions) && dayPoi.attractions.length > 0 && { attractions: dayPoi.attractions }),
                                                    },
                                                };
                                            });
                                        }
                                        if (planState.itinerary.segments.length > 0) {
                                            await this.enrichSegmentsWithGeographicData(planState.itinerary.segments, request.context, updateProgress);
                                        }
                                        planState.status = 'PROPOSED';
                                        planState.metadata = {
                                            ...planState.metadata,
                                            selectedSkeleton: selectedOption.id,
                                            selectedSkeletonName: selectedOption.name,
                                            committedAt: new Date().toISOString(),
                                        };
                                        if (attemptId && this.tripRunManager) {
                                            try {
                                                await this.tripRunManager.completeTripAttempt(attemptId, `成功提交方案: ${selectedOption.name} (${selectedOption.id})`, {
                                                    commit: {
                                                        optionId: selectedOption.id,
                                                        optionName: selectedOption.name,
                                                        planVersion: commitResult.plan_version,
                                                    },
                                                });
                                            }
                                            catch (error) {
                                                this.logger.warn(`Failed to update TripAttempt to COMPLETED: ${error.message}`);
                                            }
                                        }
                                        this.logger.debug(`行程骨架方案提交完成: ${selectedOption.name} (版本 ${commitResult.plan_version})`);
                                    }
                                }
                            }
                        }
                        catch (commitError) {
                            this.logger.error(`提交方案失败: ${commitError.message}`, commitError.stack);
                            if (attemptId && this.tripRunManager) {
                                try {
                                    await this.tripRunManager.failTripAttempt(attemptId, `提交方案失败: ${commitError.message}`);
                                }
                                catch (error) {
                                    this.logger.warn(`Failed to update TripAttempt to FAILED: ${error.message}`);
                                }
                            }
                            uiOutput.confirmations = [
                                `提交方案时发生错误: ${commitError.message}。请重试或联系支持。`,
                            ];
                        }
                    }
                    else {
                        this.logger.warn('PlanArchitectCommitOptionSkill 未注入，跳过提交方案');
                        uiOutput.confirmations = ['提交功能暂不可用，请稍后重试。'];
                    }
                    break;
                case 'adjust':
                    break;
                default:
                    if (this.architectGenerateSkeleton) {
                        this.logger.debug('默认流程：开始生成行程骨架方案...');
                        try {
                            const skeletonResult = await this.architectGenerateSkeleton.execute({
                                context: request.context,
                                tripId: request.tripId,
                                world,
                            });
                            uiOutput.skeletonOptions = skeletonResult.skeletonSet;
                            const recommendedOption = ((_s = skeletonResult.skeletonSet.options) === null || _s === void 0 ? void 0 : _s.find(opt => { var _a; return opt.id === ((_a = skeletonResult.skeletonSet.recommendation) === null || _a === void 0 ? void 0 : _a.optionId); })) || ((_t = skeletonResult.skeletonSet.options) === null || _t === void 0 ? void 0 : _t[0]);
                            if (recommendedOption && recommendedOption.dayThemes && recommendedOption.dayThemes.length > 0) {
                                planState.itinerary.segments = recommendedOption.dayThemes.map((theme, idx) => {
                                    var _a;
                                    const dayPoi = (_a = recommendedOption.pois) === null || _a === void 0 ? void 0 : _a.find(p => p.day === theme.day);
                                    return {
                                        segmentId: `day_${theme.day}_segment_1`,
                                        dayIndex: theme.day - 1,
                                        distanceKm: 0,
                                        ascentM: 0,
                                        slopePct: 0,
                                        metadata: {
                                            theme: theme.theme,
                                            description: theme.description,
                                            day: theme.day,
                                            skeletonId: recommendedOption.id,
                                            skeletonName: recommendedOption.name,
                                            ...((dayPoi === null || dayPoi === void 0 ? void 0 : dayPoi.accommodation) && { accommodation: dayPoi.accommodation }),
                                            ...((dayPoi === null || dayPoi === void 0 ? void 0 : dayPoi.restaurants) && dayPoi.restaurants.length > 0 && { restaurants: dayPoi.restaurants }),
                                            ...((dayPoi === null || dayPoi === void 0 ? void 0 : dayPoi.attractions) && dayPoi.attractions.length > 0 && { attractions: dayPoi.attractions }),
                                        },
                                    };
                                });
                                this.logger.debug(`已将骨架方案转换为 ${planState.itinerary.segments.length} 个 segments，包含POI信息`);
                                const segmentsWithPoi = planState.itinerary.segments.filter(seg => {
                                    var _a, _b, _c, _d, _e, _f;
                                    const hasAccommodation = (_b = (_a = seg.metadata) === null || _a === void 0 ? void 0 : _a.accommodation) === null || _b === void 0 ? void 0 : _b.coordinates;
                                    const hasRestaurants = (_d = (_c = seg.metadata) === null || _c === void 0 ? void 0 : _c.restaurants) === null || _d === void 0 ? void 0 : _d.some((r) => { var _a; return (_a = r.poi) === null || _a === void 0 ? void 0 : _a.coordinates; });
                                    const hasAttractions = (_f = (_e = seg.metadata) === null || _e === void 0 ? void 0 : _e.attractions) === null || _f === void 0 ? void 0 : _f.some((a) => a.coordinates);
                                    return hasAccommodation || hasRestaurants || hasAttractions;
                                });
                                this.logger.debug(`Segments中有POI坐标的数量: ${segmentsWithPoi.length}/${planState.itinerary.segments.length}`);
                            }
                            else {
                                this.logger.warn(`默认流程：推荐方案为空或没有dayThemes，无法转换为segments`);
                            }
                            if (planState.itinerary.segments.length > 0) {
                                this.logger.debug(`默认流程：开始执行阶段2.5: 填充DEM地形数据和地理特征（${planState.itinerary.segments.length} 个segments）`);
                                await this.enrichSegmentsWithGeographicData(planState.itinerary.segments, request.context);
                            }
                            else {
                                this.logger.warn(`默认流程：跳过阶段2.5: segments为空，无法填充DEM和地理特征`);
                            }
                            if (skeletonResult.skeletonSet.options && skeletonResult.skeletonSet.options.length > 1) {
                                const defaultRecommendedOption = (_u = skeletonResult.skeletonSet.options) === null || _u === void 0 ? void 0 : _u[0];
                                this.logger.debug(`默认流程：开始执行阶段2.6: 记录决策追溯链（${skeletonResult.skeletonSet.options.length} 个方案）`);
                                await this.recordDecisionTraceAndExclusions(planState, skeletonResult.skeletonSet, defaultRecommendedOption, request.context);
                            }
                            else {
                                this.logger.debug(`默认流程：跳过阶段2.6: 方案数量不足（${((_v = skeletonResult.skeletonSet.options) === null || _v === void 0 ? void 0 : _v.length) || 0} 个）`);
                            }
                            const isDefault = (_w = skeletonResult.skeletonSet.options) === null || _w === void 0 ? void 0 : _w.some(opt => opt.id === 'default_1' || opt.name === '默认方案');
                            if (isDefault) {
                                this.logger.warn(`默认流程：生成骨架方案失败，已使用默认方案（${((_x = skeletonResult.skeletonSet.options) === null || _x === void 0 ? void 0 : _x.length) || 0} 个方案）`);
                            }
                            else {
                                this.logger.debug(`默认流程：行程骨架方案生成完成: ${((_y = skeletonResult.skeletonSet.options) === null || _y === void 0 ? void 0 : _y.length) || 0} 个方案`);
                            }
                        }
                        catch (skeletonError) {
                            const isTimeout = ((_z = skeletonError.message) === null || _z === void 0 ? void 0 : _z.includes('超时')) || ((_0 = skeletonError.message) === null || _0 === void 0 ? void 0 : _0.includes('timeout'));
                            if (isTimeout) {
                                this.logger.warn(`默认流程：生成骨架方案超时: ${skeletonError.message}，技能层应已返回默认方案`);
                            }
                            else {
                                this.logger.error(`默认流程：生成骨架方案失败: ${skeletonError.message}，技能层应已返回默认方案`);
                            }
                            if (!uiOutput.skeletonOptions) {
                                const defaultDayThemes = Array.from({ length: request.context.days }, (_, i) => ({
                                    day: i + 1,
                                    theme: `第${i + 1}天`,
                                    description: `在${request.context.destination.city || request.context.destination.country}的第${i + 1}天行程`,
                                }));
                                uiOutput.skeletonOptions = {
                                    options: [{
                                            id: 'default_1',
                                            name: '默认方案',
                                            dayThemes: defaultDayThemes,
                                            anchors: [],
                                            transferDays: [],
                                            rationale: {
                                                philosophy: '默认方案（生成失败时使用）',
                                                tradeoffs: [],
                                                strengths: [],
                                                weaknesses: [],
                                            },
                                        }],
                                    recommendation: {
                                        optionId: 'default_1',
                                        reason: '生成失败，使用默认方案',
                                    },
                                };
                                planState.itinerary.segments = defaultDayThemes.map((theme, idx) => ({
                                    segmentId: `day_${theme.day}_segment_1`,
                                    dayIndex: theme.day - 1,
                                    distanceKm: 0,
                                    ascentM: 0,
                                    slopePct: 0,
                                    metadata: {
                                        theme: theme.theme,
                                        description: theme.description,
                                        day: theme.day,
                                        skeletonId: 'default_1',
                                        skeletonName: '默认方案',
                                    },
                                }));
                                this.logger.debug(`已将默认骨架方案转换为 ${planState.itinerary.segments.length} 个 segments`);
                            }
                        }
                    }
                    else {
                        this.logger.warn('PlanArchitectGenerateSkeletonSkill 未注入，跳过生成骨架方案');
                    }
            }
            if (planState.plan_id) {
                this.logger.debug('开始 System 1 快速检查...');
                if (this.budgetEstimateBaseline) {
                    this.logger.debug('执行预算估算...');
                    try {
                        const budgetResult = await this.budgetEstimateBaseline.execute({
                            planState,
                            destination: request.context.destination,
                        });
                        planState.budget.breakdown = budgetResult.budgetBreakdown;
                        this.logger.debug('预算估算完成');
                    }
                    catch (budgetError) {
                        const isTimeout = ((_1 = budgetError.message) === null || _1 === void 0 ? void 0 : _1.includes('超时')) || ((_2 = budgetError.message) === null || _2 === void 0 ? void 0 : _2.includes('timeout'));
                        if (isTimeout) {
                            this.logger.warn(`预算估算超时: ${budgetError.message}，已使用默认预算拆分`);
                        }
                        else {
                            this.logger.warn(`预算估算失败: ${budgetError.message}，已使用默认预算拆分`);
                        }
                    }
                }
                else {
                    this.logger.warn('PlanBudgetEstimateBaselineSkill 未注入，跳过预算估算');
                }
                if (this.budgetDetectOverrun) {
                    const overrunResult = await this.budgetDetectOverrun.execute({ planState });
                    if (overrunResult.overrun) {
                        planState.budget.overrun = overrunResult.overrun;
                    }
                }
                if (this.transitBuildTransferGraph) {
                    const transitResult = await this.transitBuildTransferGraph.execute({ planState });
                    planState.mobility.transferGraph = transitResult.transferGraph;
                }
                if (this.paceComputeTimeWindows) {
                    const timeWindowsResult = await this.paceComputeTimeWindows.execute({ planState });
                    planState.pace.timeWindows = timeWindowsResult.timeWindows;
                }
                if (this.paceFatigueScore) {
                    const fatigueResult = await this.paceFatigueScore.execute({ planState });
                    planState.pace.fatigueScore = fatigueResult.fatigueScore;
                }
                if (this.gatePrecheck) {
                    const gateResult = await this.gatePrecheck.execute({ planState });
                    planState.gate = gateResult.gateStatus;
                }
                if (this.constraintsDetectConflicts) {
                    const conflictsResult = await this.constraintsDetectConflicts.execute({ planState });
                }
            }
            if (planState.gate.status === 'NEED_CONFIRM' && this.gateRunThreeGuardians) {
                const guardiansResult = await this.gateRunThreeGuardians.execute({
                    planState,
                    tripId: request.tripId,
                });
                planState.gate = guardiansResult.gateStatus;
                if (guardiansResult.gateStatus.requiredUserConfirmations) {
                    uiOutput.confirmations = guardiansResult.gateStatus.requiredUserConfirmations;
                }
            }
            uiOutput.health = this.computeHealth(planState);
            if (this.personaShell) {
                this.logger.debug('包装为三人格输出...');
                uiOutput.personas = await this.personaShell.wrapAsPersonas(planState);
                this.logger.debug('三人格输出完成');
            }
            else {
                this.logger.warn('PersonaShellService 未注入，跳过三人格输出');
            }
            if (this.logAppendDecision && planState.plan_id) {
                await this.logAppendDecision.execute({
                    decision_id: `decision_${Date.now()}`,
                    diff: { type: 'plan_update' },
                    evidence_refs: planState.evidence_refs.map(e => e.source_title),
                    rule_version: '1.0.0',
                });
            }
            if (planState.plan_id && request.tripId) {
                await this.savePlan(planState, uiOutput, request.tripId);
            }
            if (tripRunId && this.tripRunManager) {
                try {
                    await this.tripRunManager.completeTripRun(tripRunId, {
                        userAction: request.userAction || 'generate',
                        completed: true,
                    });
                }
                catch (error) {
                    this.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
                }
            }
            updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(95, '正在完成规划工作台流程...');
            return {
                planState,
                uiOutput,
            };
        }
        catch (error) {
            this.logger.error(`规划工作台执行失败: ${error.message}`, error.stack);
            if (tripRunId && this.tripRunManager) {
                try {
                    await this.tripRunManager.failTripRun(tripRunId, error, {
                        userAction: request.userAction || 'generate',
                    });
                }
                catch (updateError) {
                    this.logger.warn(`Failed to update TripRun to FAILED: ${updateError.message}`);
                }
            }
            throw error;
        }
    }
    createInitialPlanState(context, tripId) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return {
            plan_id: `plan_${Date.now()}`,
            plan_version: 1,
            constraints: {
                time: {
                    days: context.days,
                },
                budget: ((_a = context.constraints) === null || _a === void 0 ? void 0 : _a.budget) || {},
                fitness: ((_b = context.constraints) === null || _b === void 0 ? void 0 : _b.fitness) || {},
                travelMode: context.travelMode,
                accommodation: (_c = context.constraints) === null || _c === void 0 ? void 0 : _c.accommodation,
                mustDo: context.mustDo,
                mustAvoid: context.mustAvoid,
                companions: (_d = context.constraints) === null || _d === void 0 ? void 0 : _d.companions,
            },
            itinerary: {
                tripId: tripId || ((_f = (_e = context.existingPlanState) === null || _e === void 0 ? void 0 : _e.itinerary) === null || _f === void 0 ? void 0 : _f.tripId) || `trip_${Date.now()}`,
                routeDirectionId: ((_h = (_g = context.existingPlanState) === null || _g === void 0 ? void 0 : _g.itinerary) === null || _h === void 0 ? void 0 : _h.routeDirectionId) || `route_${Date.now()}`,
                segments: [],
            },
            mobility: {
                transferSegments: [],
            },
            budget: {},
            pace: {},
            gate: {
                status: 'NEED_CONFIRM',
                reasons: ['初始状态，待验证'],
                missingEvidence: [],
            },
            evidence_refs: [],
            decision_log_refs: [],
            status: 'DRAFT',
            metadata: {},
        };
    }
    async enrichSegmentsWithGeographicData(segments, context, updateProgress) {
        if (segments.length === 0) {
            this.logger.debug(`enrichSegmentsWithGeographicData: segments为空，跳过`);
            return;
        }
        this.logger.debug(`开始填充 ${segments.length} 个segments的地理数据...`);
        this.logger.debug(`DEM服务可用: ${!!this.demEffortMetadataService}, 地理特征服务可用: ${!!this.geoFactsService}, 危险区域检测可用: ${!!this.geoCheckHazardZonesSkill}`);
        let completedCount = 0;
        let progressUpdateQueue = Promise.resolve();
        const baseProgress = 60;
        const progressRange = 20;
        const totalSegments = segments.length;
        const atomicUpdateProgress = (progress, stage) => {
            progressUpdateQueue = progressUpdateQueue.then(() => {
                updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(progress, stage);
                return Promise.resolve();
            });
        };
        const segmentTasks = segments.map((segment, index) => async () => {
            var _a, _b, _c, _d, _e, _f;
            try {
                const startProgress = baseProgress + Math.floor((index / totalSegments) * progressRange);
                atomicUpdateProgress(startProgress, `正在填充Segment ${index + 1}/${totalSegments}的地理数据...`);
                this.logger.debug(`开始处理Segment ${index + 1}/${totalSegments}，进度: ${startProgress}%`);
                const routePoints = this.extractRoutePointsFromSegment(segment);
                this.logger.debug(`Segment ${index + 1}: 提取到 ${routePoints.length} 个POI坐标点`);
                if (routePoints.length >= 2) {
                    if (this.demEffortMetadataService) {
                        try {
                            this.logger.debug(`Segment ${index + 1}: 开始调用DEM服务计算地形数据（${routePoints.length} 个点）...`);
                            const demStartTime = Date.now();
                            const demPromise = this.demEffortMetadataService.calculateEffortMetadata(routePoints, {
                                activityType: context.travelMode === 'self_drive' ? 'driving' :
                                    context.travelMode === 'walking' ? 'walking' : 'walking',
                                includeElevationProfile: false,
                            });
                            const timeoutPromise = new Promise((_, reject) => {
                                setTimeout(() => reject(new Error('DEM服务调用超时（30秒）')), 30000);
                            });
                            const effortMetadata = await Promise.race([demPromise, timeoutPromise]);
                            const demDuration = Date.now() - demStartTime;
                            this.logger.debug(`Segment ${index + 1}: DEM服务调用完成，耗时 ${demDuration}ms`);
                            const demProgress = baseProgress + Math.floor((index / totalSegments) * progressRange) + Math.floor((progressRange / totalSegments) * 0.6);
                            atomicUpdateProgress(demProgress, `Segment ${index + 1}: DEM地形数据计算完成`);
                            segment.distanceKm = effortMetadata.totalDistance / 1000;
                            segment.ascentM = effortMetadata.totalAscent;
                            segment.slopePct = effortMetadata.maxSlope;
                            segment.metadata = {
                                ...segment.metadata,
                                elevation: {
                                    max: effortMetadata.maxElevation,
                                    min: effortMetadata.minElevation,
                                    avg: effortMetadata.avgElevation,
                                },
                                terrainComplexity: effortMetadata.terrainComplexity,
                                difficulty: effortMetadata.difficulty,
                                effortScore: effortMetadata.effortScore,
                            };
                            this.logger.debug(`Segment ${index + 1}: 距离=${segment.distanceKm.toFixed(1)}km, 爬升=${segment.ascentM.toFixed(0)}m, 坡度=${segment.slopePct.toFixed(1)}%`);
                        }
                        catch (demError) {
                            const isTimeout = ((_a = demError.message) === null || _a === void 0 ? void 0 : _a.includes('超时')) || ((_b = demError.message) === null || _b === void 0 ? void 0 : _b.includes('timeout')) || ((_c = demError.message) === null || _c === void 0 ? void 0 : _c.includes('TIMEOUT'));
                            this.logger.warn(`填充Segment ${index + 1}的DEM数据失败: ${demError.message}${isTimeout ? ' (超时)' : ''}`);
                            if (isTimeout) {
                                const skipProgress = baseProgress + Math.floor((index / totalSegments) * progressRange) + Math.floor((progressRange / totalSegments) * 0.7);
                                atomicUpdateProgress(skipProgress, `Segment ${index + 1}: DEM服务超时，跳过地形数据填充`);
                            }
                        }
                    }
                    if (this.geoFactsService && routePoints.length > 0) {
                        try {
                            this.logger.debug(`Segment ${index + 1}: 开始查询地理特征...`);
                            const geoStartTime = Date.now();
                            const centerPoint = this.calculateSegmentCenter(routePoints);
                            const geoPromise = this.geoFactsService.getGeoFeaturesForPoint(centerPoint.lat, centerPoint.lng, {
                                useCache: true,
                                month: new Date().getMonth() + 1,
                            });
                            const timeoutPromise = new Promise((_, reject) => {
                                setTimeout(() => reject(new Error('地理特征查询超时（10秒）')), 10000);
                            });
                            const geoFeatures = await Promise.race([geoPromise, timeoutPromise]);
                            const geoDuration = Date.now() - geoStartTime;
                            this.logger.debug(`Segment ${index + 1}: 地理特征查询完成，耗时 ${geoDuration}ms`);
                            const geoProgress = baseProgress + Math.floor((index / totalSegments) * progressRange) + Math.floor((progressRange / totalSegments) * 0.8);
                            atomicUpdateProgress(geoProgress, `Segment ${index + 1}: 地理特征查询完成`);
                            segment.metadata = {
                                ...segment.metadata,
                                geoFeatures: {
                                    rivers: {
                                        nearRiver: geoFeatures.rivers.nearRiver,
                                        riverDensityScore: geoFeatures.rivers.riverDensityScore,
                                    },
                                    mountains: {
                                        mountainDensityScore: geoFeatures.mountains.mountainDensityScore,
                                    },
                                    roads: {
                                        nearRoad: geoFeatures.roads.nearRoad,
                                        roadDensityScore: geoFeatures.roads.roadDensityScore,
                                    },
                                    coastlines: {
                                        nearCoastline: geoFeatures.coastlines.nearCoastline,
                                    },
                                    accessibility: {
                                        hasPort: geoFeatures.ports.nearPort,
                                        hasAirport: geoFeatures.airlines.nearAirport,
                                    },
                                },
                            };
                            if (this.geoCheckHazardZonesSkill && routePoints.length >= 2) {
                                try {
                                    const countryCode = this.inferCountryCode(context);
                                    if (countryCode) {
                                        const hazards = await this.geoCheckHazardZonesSkill.execute({
                                            route: routePoints,
                                            countryCode,
                                            month: new Date().getMonth() + 1,
                                            bufferRadius: 1000,
                                        });
                                        if (hazards && hazards.hazardZones && hazards.hazardZones.length > 0) {
                                            segment.metadata = {
                                                ...segment.metadata,
                                                hazards: hazards.hazardZones.map((h) => ({
                                                    zoneId: h.zoneId,
                                                    type: h.type,
                                                    level: h.level,
                                                    location: h.location,
                                                    description: h.description,
                                                })),
                                                riskAssessment: hazards.riskAssessment,
                                            };
                                            this.logger.warn(`Segment ${index + 1} 检测到 ${hazards.hazardZones.length} 个危险区域`);
                                        }
                                    }
                                }
                                catch (hazardError) {
                                    this.logger.debug(`检测Segment ${index + 1}的危险区域失败: ${hazardError.message}`);
                                }
                            }
                        }
                        catch (geoError) {
                            const isTimeout = ((_d = geoError.message) === null || _d === void 0 ? void 0 : _d.includes('超时')) || ((_e = geoError.message) === null || _e === void 0 ? void 0 : _e.includes('timeout')) || ((_f = geoError.message) === null || _f === void 0 ? void 0 : _f.includes('TIMEOUT'));
                            this.logger.warn(`填充Segment ${index + 1}的地理特征失败: ${geoError.message}${isTimeout ? ' (超时)' : ''}`);
                            if (isTimeout) {
                                const skipProgress = baseProgress + Math.floor((index / totalSegments) * progressRange) + Math.floor((progressRange / totalSegments) * 0.85);
                                atomicUpdateProgress(skipProgress, `Segment ${index + 1}: 地理特征查询超时，跳过`);
                            }
                        }
                    }
                }
                else if (routePoints.length === 1) {
                    this.logger.debug(`Segment ${index + 1}: 只有1个POI坐标，跳过DEM计算，只查询地理特征`);
                    if (this.geoFactsService) {
                        try {
                            const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(routePoints[0].lat, routePoints[0].lng, { useCache: true });
                            segment.metadata = {
                                ...segment.metadata,
                                geoFeatures: {
                                    rivers: { nearRiver: geoFeatures.rivers.nearRiver },
                                    roads: { nearRoad: geoFeatures.roads.nearRoad },
                                    coastlines: { nearCoastline: geoFeatures.coastlines.nearCoastline },
                                },
                            };
                        }
                        catch (geoError) {
                            this.logger.debug(`填充Segment ${index + 1}的地理特征失败: ${geoError.message}`);
                        }
                    }
                }
                else {
                    this.logger.debug(`Segment ${index + 1}: 没有POI坐标，跳过DEM和地理特征填充`);
                }
            }
            catch (error) {
                this.logger.warn(`填充Segment ${index + 1}的地理数据失败: ${error.message}`, error.stack);
            }
            finally {
                progressUpdateQueue = progressUpdateQueue.then(() => {
                    completedCount++;
                    const finalProgress = baseProgress + Math.floor((completedCount / totalSegments) * progressRange);
                    updateProgress === null || updateProgress === void 0 ? void 0 : updateProgress(finalProgress, `已完成 ${completedCount}/${totalSegments} 个segments的地理数据填充`);
                    this.logger.debug(`完成处理Segment ${index + 1}/${totalSegments}，进度: ${finalProgress}%，已完成: ${completedCount}/${totalSegments}`);
                    return Promise.resolve();
                });
            }
        });
        await (0, orchestration_utils_1.runBounded)(segmentTasks, this.geoFeaturesMaxConcurrency);
        await progressUpdateQueue;
        this.logger.debug(`完成填充 ${segments.length} 个segments的地理数据`);
        atomicUpdateProgress(80, 'DEM地形数据和地理特征填充完成');
    }
    extractRoutePointsFromSegment(segment) {
        var _a, _b, _c, _d;
        const points = [];
        const metadata = segment.metadata || {};
        if ((_a = metadata.accommodation) === null || _a === void 0 ? void 0 : _a.coordinates) {
            points.push(metadata.accommodation.coordinates);
            this.logger.debug(`从accommodation提取坐标: (${metadata.accommodation.coordinates.lat}, ${metadata.accommodation.coordinates.lng})`);
        }
        if (metadata.restaurants && Array.isArray(metadata.restaurants)) {
            for (const restaurant of metadata.restaurants) {
                if ((_b = restaurant.poi) === null || _b === void 0 ? void 0 : _b.coordinates) {
                    points.push(restaurant.poi.coordinates);
                    this.logger.debug(`从restaurant提取坐标: (${restaurant.poi.coordinates.lat}, ${restaurant.poi.coordinates.lng})`);
                }
            }
        }
        if (metadata.attractions && Array.isArray(metadata.attractions)) {
            for (const attraction of metadata.attractions) {
                if (attraction.coordinates) {
                    points.push(attraction.coordinates);
                    this.logger.debug(`从attraction提取坐标: (${attraction.coordinates.lat}, ${attraction.coordinates.lng})`);
                }
            }
        }
        if (points.length === 0) {
            this.logger.debug(`Segment ${segment.segmentId}: 未找到任何POI坐标（accommodation: ${!!metadata.accommodation}, restaurants: ${((_c = metadata.restaurants) === null || _c === void 0 ? void 0 : _c.length) || 0}, attractions: ${((_d = metadata.attractions) === null || _d === void 0 ? void 0 : _d.length) || 0}）`);
        }
        return points;
    }
    calculateSegmentCenter(points) {
        if (points.length === 0) {
            return { lat: 0, lng: 0 };
        }
        if (points.length === 1) {
            return points[0];
        }
        const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
        const avgLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
        return { lat: avgLat, lng: avgLng };
    }
    async recordDecisionTraceAndExclusions(planState, skeletonSet, recommendedOption, context) {
        var _a, _b, _c, _d;
        try {
            const exclusionLog = [];
            if (recommendedOption && skeletonSet.options) {
                for (const option of skeletonSet.options) {
                    if (option.id !== recommendedOption.id) {
                        const exclusionReason = this.analyzeExclusionReason(option, recommendedOption, skeletonSet.recommendation, context);
                        exclusionLog.push({
                            excludedOptionId: option.id,
                            excludedOptionName: option.name,
                            reason: exclusionReason.reason,
                            evidence: exclusionReason.evidence,
                            timestamp: new Date().toISOString(),
                        });
                    }
                }
            }
            const decisionLogRefs = [];
            if (recommendedOption) {
                decisionLogRefs.push({
                    decision_id: `decision_${Date.now()}_skeleton_selection`,
                    diff: {
                        type: 'skeleton_selection',
                        selectedOptionId: recommendedOption.id,
                        selectedOptionName: recommendedOption.name,
                        excludedOptions: exclusionLog.map(e => e.excludedOptionId),
                    },
                    evidence_refs: [
                        `skeleton_set_${((_a = skeletonSet.options) === null || _a === void 0 ? void 0 : _a.length) || 0}_options`,
                        `recommendation_${((_b = skeletonSet.recommendation) === null || _b === void 0 ? void 0 : _b.optionId) || 'none'}`,
                    ],
                    rule_version: '1.0.0',
                    timestamp: new Date().toISOString(),
                });
            }
            planState.metadata = {
                ...planState.metadata,
                exclusionLog,
                decisionTrace: {
                    skeletonSelection: {
                        timestamp: new Date().toISOString(),
                        totalOptions: ((_c = skeletonSet.options) === null || _c === void 0 ? void 0 : _c.length) || 0,
                        selectedOptionId: recommendedOption === null || recommendedOption === void 0 ? void 0 : recommendedOption.id,
                        recommendationReason: (_d = skeletonSet.recommendation) === null || _d === void 0 ? void 0 : _d.reason,
                    },
                },
            };
            planState.decision_log_refs = [
                ...(planState.decision_log_refs || []),
                ...decisionLogRefs,
            ];
            this.logger.debug(`已记录决策追溯链和排除过程: ${exclusionLog.length} 个排除项`);
        }
        catch (error) {
            this.logger.warn(`记录决策追溯链失败: ${error.message}`);
        }
    }
    analyzeExclusionReason(excludedOption, recommendedOption, recommendation, context) {
        var _a, _b, _c, _d, _e, _f;
        const evidence = [];
        let reason = '不符合推荐标准';
        if (recommendation === null || recommendation === void 0 ? void 0 : recommendation.reason) {
            reason = `推荐理由: ${recommendation.reason}`;
        }
        if (excludedOption.name === '紧凑型' && (recommendedOption === null || recommendedOption === void 0 ? void 0 : recommendedOption.name) !== '紧凑型') {
            evidence.push('紧凑型方案节奏较紧，可能不符合用户偏好');
            if (((_b = (_a = context.constraints) === null || _a === void 0 ? void 0 : _a.fitness) === null || _b === void 0 ? void 0 : _b.level) === 'low') {
                evidence.push('用户体力水平较低，不适合紧凑型方案');
            }
        }
        if (excludedOption.name === '松弛型' && (recommendedOption === null || recommendedOption === void 0 ? void 0 : recommendedOption.name) !== '松弛型') {
            evidence.push('松弛型方案节奏较慢，可能无法充分利用时间');
            if (context.days && context.days <= 3) {
                evidence.push('行程天数较短，建议选择更紧凑的方案');
            }
        }
        if ((_d = (_c = context.constraints) === null || _c === void 0 ? void 0 : _c.budget) === null || _d === void 0 ? void 0 : _d.total) {
            evidence.push('已考虑预算约束');
        }
        if ((_f = (_e = context.constraints) === null || _e === void 0 ? void 0 : _e.fitness) === null || _f === void 0 ? void 0 : _f.level) {
            if (excludedOption.name === '紧凑型' && context.constraints.fitness.level === 'low') {
                evidence.push('紧凑型方案不适合低体力水平用户');
            }
        }
        if (evidence.length === 0) {
            evidence.push('根据综合评估，该方案不如推荐方案适合当前需求');
        }
        return { reason, evidence };
    }
    inferCountryCode(context) {
        var _a;
        const country = (_a = context.destination) === null || _a === void 0 ? void 0 : _a.country;
        if (!country) {
            return null;
        }
        const countryCodeMap = {
            '冰岛': 'IS',
            'Iceland': 'IS',
            '格陵兰': 'GL',
            'Greenland': 'GL',
            '挪威': 'NO',
            'Norway': 'NO',
            '阿根廷': 'AR',
            'Argentina': 'AR',
            '中国': 'CN',
            'China': 'CN',
        };
        return countryCodeMap[country] || null;
    }
    computeHealth(planState) {
        var _a;
        const health = {
            budget: 'healthy',
            pace: 'healthy',
            feasibility: 'healthy',
        };
        if (planState.budget.overrun) {
            const overrunRatio = planState.budget.overrun.overrunAmount / (((_a = planState.constraints.budget) === null || _a === void 0 ? void 0 : _a.total) || 1);
            if (overrunRatio > 0.2) {
                health.budget = 'critical';
            }
            else if (overrunRatio > 0.1) {
                health.budget = 'warning';
            }
        }
        if (planState.pace.fatigueScore) {
            if (planState.pace.fatigueScore.paceScore > 85) {
                health.pace = 'critical';
            }
            else if (planState.pace.fatigueScore.paceScore > 70) {
                health.pace = 'warning';
            }
        }
        const infeasibleCount = planState.mobility.transferSegments.filter(seg => seg.feasibility === 'infeasible').length;
        if (infeasibleCount > 0) {
            health.feasibility = infeasibleCount > planState.mobility.transferSegments.length / 2 ? 'critical' : 'warning';
        }
        return health;
    }
    async commitPlan(planId, tripId, options) {
        var _a, _b, _c, _d;
        this.logger.debug(`提交方案: planId=${planId}, tripId=${tripId}, partialCommit=${(options === null || options === void 0 ? void 0 : options.partialCommit) || false}`);
        try {
            let planState = null;
            if (this.stateStore) {
                const stored = await this.stateStore.get(planId, 'PlanState');
                if (stored) {
                    planState = stored.data;
                    this.logger.debug(`从 StateStore 获取 PlanState: ${planId}`);
                }
            }
            if (!planState && this.prisma) {
                const trip = await this.prisma.trip.findUnique({
                    where: { id: tripId },
                    select: { metadata: true },
                });
                if (trip === null || trip === void 0 ? void 0 : trip.metadata) {
                    const metadata = trip.metadata;
                    if (metadata.planState && metadata.planState.plan_id === planId) {
                        planState = metadata.planState;
                        this.logger.debug(`从 Trip metadata 获取 PlanState: ${planId}`);
                    }
                }
            }
            if (!planState) {
                throw new common_1.NotFoundException(`找不到规划方案: ${planId}`);
            }
            if (this.prisma) {
                const trip = await this.prisma.trip.findUnique({
                    where: { id: tripId },
                    include: {
                        TripDay: {
                            include: {
                                ItineraryItem: true,
                            },
                            orderBy: {
                                date: 'asc',
                            },
                        },
                    },
                });
                if (!trip) {
                    throw new common_1.NotFoundException(`找不到行程: ${tripId}`);
                }
                const changes = {
                    added: 0,
                    modified: 0,
                    removed: 0,
                };
                const metadata = trip.metadata || {};
                const previousPlanState = metadata.planState;
                metadata.planState = planState;
                metadata.lastCommittedPlanId = planId;
                metadata.lastCommittedAt = new Date().toISOString();
                if ((options === null || options === void 0 ? void 0 : options.partialCommit) && (options === null || options === void 0 ? void 0 : options.commitDays) && options.commitDays.length > 0) {
                    this.logger.debug(`部分提交: 更新天数 ${options.commitDays.join(', ')}`);
                    planState.status = 'PROPOSED';
                    const affectedDays = options.commitDays;
                    changes.added = affectedDays.length;
                }
                else {
                    planState.status = 'LOCKED';
                    if (previousPlanState) {
                        const previousSegments = ((_a = previousPlanState.itinerary) === null || _a === void 0 ? void 0 : _a.segments) || [];
                        const currentSegments = ((_b = planState.itinerary) === null || _b === void 0 ? void 0 : _b.segments) || [];
                        changes.added = currentSegments.length - previousSegments.length;
                        changes.modified = Math.min(previousSegments.length, currentSegments.length);
                    }
                    else {
                        changes.added = ((_d = (_c = planState.itinerary) === null || _c === void 0 ? void 0 : _c.segments) === null || _d === void 0 ? void 0 : _d.length) || 0;
                    }
                }
                await this.prisma.trip.update({
                    where: { id: tripId },
                    data: {
                        metadata: metadata,
                        updatedAt: new Date(),
                    },
                });
                if (this.stateStore) {
                    const currentVersion = await this.stateStore.getVersion(planId, 'PlanState');
                    if (currentVersion !== null) {
                        await this.stateStore.update(planId, 'PlanState', [{ op: 'replace', path: '/', value: planState }], currentVersion, 'PlanningWorkbenchAgentService', `commit_${planId}`, {
                            action: 'commit',
                            reason: `Commit plan to trip ${tripId}${(options === null || options === void 0 ? void 0 : options.partialCommit) ? ' (partial)' : ''}`,
                        });
                    }
                    else {
                        await this.stateStore.create(planId, 'PlanState', planState, 'PlanningWorkbenchAgentService', `commit_${planId}`);
                    }
                }
                this.logger.debug(`方案提交成功: planId=${planId}, tripId=${tripId}, changes=${JSON.stringify(changes)}`);
                return {
                    tripId,
                    planId,
                    committedAt: new Date().toISOString(),
                    changes,
                };
            }
            else {
                this.logger.warn('PrismaService 未注入，无法保存到数据库');
                return {
                    tripId,
                    planId,
                    committedAt: new Date().toISOString(),
                    changes: {
                        added: 0,
                        modified: 0,
                        removed: 0,
                    },
                };
            }
        }
        catch (error) {
            this.logger.error(`提交方案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async getPlanState(planId) {
        this.logger.debug(`获取 PlanState: planId=${planId}`);
        if (this.stateStore) {
            const stored = await this.stateStore.get(planId, 'PlanState');
            if (stored) {
                return {
                    planId,
                    planState: stored.data,
                };
            }
        }
        return {
            planId,
            planState: null,
        };
    }
    async getTripWorkbench(tripId) {
        var _a, _b, _c, _d, _e, _f, _g;
        this.logger.debug(`获取行程工作台数据: tripId=${tripId}`);
        if (!this.prisma) {
            throw new Error('PrismaService 未注入');
        }
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { id: true, metadata: true },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`找不到行程: ${tripId}`);
        }
        const metadata = trip.metadata || {};
        const currentPlanId = metadata.lastCommittedPlanId || metadata.currentPlanId;
        let currentPlan = null;
        if (currentPlanId) {
            if (this.stateStore) {
                const stored = await this.stateStore.get(currentPlanId, 'PlanState');
                if (stored) {
                    const planState = stored.data;
                    const uiOutput = ((_b = (_a = metadata.plans) === null || _a === void 0 ? void 0 : _a[currentPlanId]) === null || _b === void 0 ? void 0 : _b.uiOutput) || {};
                    currentPlan = {
                        planId: currentPlanId,
                        planVersion: planState.plan_version || 1,
                        status: planState.status || 'DRAFT',
                        planState,
                        uiOutput,
                        createdAt: ((_d = (_c = metadata.plans) === null || _c === void 0 ? void 0 : _c[currentPlanId]) === null || _d === void 0 ? void 0 : _d.createdAt) || new Date().toISOString(),
                        updatedAt: ((_f = (_e = metadata.plans) === null || _e === void 0 ? void 0 : _e[currentPlanId]) === null || _f === void 0 ? void 0 : _f.updatedAt) || new Date().toISOString(),
                    };
                }
            }
        }
        const planHistory = [];
        if (metadata.plans) {
            for (const [planId, planData] of Object.entries(metadata.plans)) {
                planHistory.push({
                    planId,
                    planVersion: planData.planVersion || 1,
                    status: planData.status || 'DRAFT',
                    createdAt: planData.createdAt || new Date().toISOString(),
                    summary: planData.summary,
                });
            }
        }
        planHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const workbenchStatus = (currentPlan === null || currentPlan === void 0 ? void 0 : currentPlan.status) || metadata.workbenchStatus || 'DRAFT';
        let decisionProcess = undefined;
        if (this.decisionDraftStorage) {
            try {
                const decisionDraft = await this.decisionDraftStorage.loadDecisionDraftByTripId(tripId);
                if (decisionDraft) {
                    decisionProcess = {
                        draftId: decisionDraft.draft_id,
                        decisionSteps: decisionDraft.decision_steps || [],
                        userMode: decisionDraft.user_mode || 'toc',
                    };
                    this.logger.debug(`加载决策过程: draftId=${decisionDraft.draft_id}, steps=${((_g = decisionDraft.decision_steps) === null || _g === void 0 ? void 0 : _g.length) || 0}`);
                }
                else {
                    this.logger.debug(`行程 ${tripId} 没有关联的决策草案`);
                }
            }
            catch (error) {
                this.logger.warn(`加载决策草案失败: ${error.message}`, error.stack);
            }
        }
        return {
            tripId,
            currentPlan: currentPlan || undefined,
            planHistory,
            workbenchStatus: workbenchStatus,
            decisionProcess,
        };
    }
    async getTripPlans(tripId, options) {
        this.logger.debug(`获取行程方案列表: tripId=${tripId}, options=${JSON.stringify(options)}`);
        if (!this.prisma) {
            throw new Error('PrismaService 未注入');
        }
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
            select: { id: true, metadata: true },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`找不到行程: ${tripId}`);
        }
        const metadata = trip.metadata || {};
        const allPlans = [];
        if (metadata.plans) {
            for (const [planId, planData] of Object.entries(metadata.plans)) {
                const plan = planData;
                allPlans.push({
                    planId,
                    planVersion: plan.planVersion || 1,
                    status: plan.status || 'DRAFT',
                    createdAt: plan.createdAt || new Date().toISOString(),
                    updatedAt: plan.updatedAt || new Date().toISOString(),
                    summary: plan.summary,
                });
            }
        }
        let filteredPlans = allPlans;
        if (options === null || options === void 0 ? void 0 : options.status) {
            filteredPlans = allPlans.filter(p => p.status === options.status);
        }
        filteredPlans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const limit = (options === null || options === void 0 ? void 0 : options.limit) || 20;
        const offset = (options === null || options === void 0 ? void 0 : options.offset) || 0;
        const paginatedPlans = filteredPlans.slice(offset, offset + limit);
        const hasMore = offset + limit < filteredPlans.length;
        return {
            plans: paginatedPlans,
            total: filteredPlans.length,
            hasMore,
        };
    }
    async getPlan(planId) {
        var _a, _b;
        this.logger.debug(`获取方案详情: planId=${planId}`);
        if (this.stateStore) {
            const stored = await this.stateStore.get(planId, 'PlanState');
            if (stored) {
                const planState = stored.data;
                let tripId = ((_a = planState.itinerary) === null || _a === void 0 ? void 0 : _a.tripId) || '';
                let uiOutput = {};
                let createdAt = new Date().toISOString();
                let updatedAt = new Date().toISOString();
                let createdBy;
                if (tripId && this.prisma) {
                    const trip = await this.prisma.trip.findUnique({
                        where: { id: tripId },
                        select: { metadata: true },
                    });
                    if (trip === null || trip === void 0 ? void 0 : trip.metadata) {
                        const metadata = trip.metadata;
                        const planData = (_b = metadata.plans) === null || _b === void 0 ? void 0 : _b[planId];
                        if (planData) {
                            uiOutput = planData.uiOutput || {};
                            createdAt = planData.createdAt || createdAt;
                            updatedAt = planData.updatedAt || updatedAt;
                            createdBy = planData.createdBy;
                        }
                    }
                }
                return {
                    planId,
                    planVersion: planState.plan_version || 1,
                    tripId: tripId || '',
                    status: planState.status || 'DRAFT',
                    planState,
                    uiOutput,
                    createdAt,
                    updatedAt,
                    createdBy,
                };
            }
        }
        throw new common_1.NotFoundException(`找不到规划方案: ${planId}`);
    }
    async comparePlans(planIds, compareFields) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        this.logger.debug(`对比方案: planIds=${planIds.join(', ')}`);
        if (planIds.length < 2) {
            throw new Error('至少需要 2 个方案进行对比');
        }
        const plans = [];
        for (const planId of planIds) {
            const plan = await this.getPlan(planId);
            plans.push({
                planId: plan.planId,
                planVersion: plan.planVersion,
                planState: plan.planState,
                uiOutput: plan.uiOutput,
            });
        }
        const differences = [];
        if (plans.length >= 2) {
            const plan1 = plans[0];
            const plan2 = plans[1];
            const budget1 = ((_c = (_b = (_a = plan1.planState.budget) === null || _a === void 0 ? void 0 : _a.breakdown) === null || _b === void 0 ? void 0 : _b.categories) === null || _c === void 0 ? void 0 : _c.reduce((sum, cat) => sum + (cat.estimated || 0), 0)) || 0;
            const budget2 = ((_f = (_e = (_d = plan2.planState.budget) === null || _d === void 0 ? void 0 : _d.breakdown) === null || _e === void 0 ? void 0 : _e.categories) === null || _f === void 0 ? void 0 : _f.reduce((sum, cat) => sum + (cat.estimated || 0), 0)) || 0;
            if (budget1 !== budget2) {
                differences.push({
                    field: 'budget.total',
                    plan1Value: budget1,
                    plan2Value: budget2,
                    impact: Math.abs(budget1 - budget2) / Math.max(budget1, budget2) > 0.2 ? 'high' : 'medium',
                    description: `预算差异: ${Math.abs(budget1 - budget2)}`,
                });
            }
            const days1 = ((_h = (_g = plan1.planState.constraints) === null || _g === void 0 ? void 0 : _g.time) === null || _h === void 0 ? void 0 : _h.days) || 0;
            const days2 = ((_k = (_j = plan2.planState.constraints) === null || _j === void 0 ? void 0 : _j.time) === null || _k === void 0 ? void 0 : _k.days) || 0;
            if (days1 !== days2) {
                differences.push({
                    field: 'constraints.time.days',
                    plan1Value: days1,
                    plan2Value: days2,
                    impact: 'medium',
                    description: `行程天数差异: ${Math.abs(days1 - days2)} 天`,
                });
            }
        }
        const summary = {
            recommendations: [],
        };
        if (plans.length >= 2) {
            const budgets = plans.map(p => {
                var _a, _b, _c;
                return ({
                    planId: p.planId,
                    budget: ((_c = (_b = (_a = p.planState.budget) === null || _a === void 0 ? void 0 : _a.breakdown) === null || _b === void 0 ? void 0 : _b.categories) === null || _c === void 0 ? void 0 : _c.reduce((sum, cat) => sum + (cat.estimated || 0), 0)) || 0,
                });
            });
            const bestBudgetPlan = budgets.reduce((min, p) => (p.budget < min.budget ? p : min));
            summary.bestBudget = bestBudgetPlan.planId;
            (_l = summary.recommendations) === null || _l === void 0 ? void 0 : _l.push(`方案 ${bestBudgetPlan.planId} 预算最优`);
        }
        return {
            plans,
            differences,
            summary,
        };
    }
    async adjustPlan(planId, adjustments, regenerate = true) {
        var _a, _b, _c, _d, _e, _f;
        this.logger.debug(`调整方案: planId=${planId}, adjustments=${adjustments.length}`);
        const existingPlan = await this.getPlan(planId);
        let planState = existingPlan.planState;
        const changes = [];
        for (const adjustment of adjustments) {
            switch (adjustment.type) {
                case 'add_place':
                    changes.push({
                        type: 'add_place',
                        description: `添加地点: ${adjustment.data.placeName || '未知'}`,
                        impact: 'medium',
                    });
                    break;
                case 'remove_place':
                    changes.push({
                        type: 'remove_place',
                        description: `移除地点: ${adjustment.data.placeName || '未知'}`,
                        impact: 'medium',
                    });
                    break;
                case 'modify_constraint':
                    changes.push({
                        type: 'modify_constraint',
                        description: `修改约束: ${adjustment.data.constraintType || '未知'}`,
                        impact: 'high',
                    });
                    if (adjustment.data.budget) {
                        planState.constraints.budget = {
                            ...planState.constraints.budget,
                            ...adjustment.data.budget,
                        };
                    }
                    break;
                case 'change_day':
                    changes.push({
                        type: 'change_day',
                        description: `调整天数: ${adjustment.data.day || '未知'}`,
                        impact: 'high',
                    });
                    break;
                case 'modify_budget':
                    changes.push({
                        type: 'modify_budget',
                        description: `修改预算: ${adjustment.data.total || '未知'}`,
                        impact: 'high',
                    });
                    if (adjustment.data.total) {
                        planState.constraints.budget = {
                            ...planState.constraints.budget,
                            total: adjustment.data.total,
                        };
                    }
                    break;
                default:
                    this.logger.warn(`未知的调整类型: ${adjustment.type}`);
            }
        }
        let uiOutput = existingPlan.uiOutput;
        if (regenerate) {
            const newPlanId = `plan_${Date.now()}`;
            planState.plan_id = newPlanId;
            planState.plan_version = (planState.plan_version || 1) + 1;
            planState.status = 'DRAFT';
            const context = {
                destination: {
                    country: (_b = (_a = planState.metadata) === null || _a === void 0 ? void 0 : _a.destination) === null || _b === void 0 ? void 0 : _b.country,
                    city: (_d = (_c = planState.metadata) === null || _c === void 0 ? void 0 : _c.destination) === null || _d === void 0 ? void 0 : _d.city,
                    region: (_f = (_e = planState.metadata) === null || _e === void 0 ? void 0 : _e.destination) === null || _f === void 0 ? void 0 : _f.region,
                },
                days: planState.constraints.time.days,
                travelMode: planState.constraints.travelMode,
                constraints: {
                    budget: planState.constraints.budget,
                    fitness: planState.constraints.fitness,
                    accommodation: planState.constraints.accommodation,
                    companions: planState.constraints.companions,
                },
                mustDo: planState.constraints.mustDo,
                mustAvoid: planState.constraints.mustAvoid,
            };
            const result = await this.execute({
                context,
                tripId: existingPlan.tripId,
                existingPlanState: planState,
                userAction: 'generate',
            });
            planState = result.planState;
            uiOutput = result.uiOutput;
            if (this.stateStore) {
                await this.stateStore.create(newPlanId, 'PlanState', planState, 'PlanningWorkbenchAgentService', `adjust_${planId}`);
            }
            if (this.prisma && existingPlan.tripId) {
                const trip = await this.prisma.trip.findUnique({
                    where: { id: existingPlan.tripId },
                    select: { metadata: true },
                });
                if (trip) {
                    const metadata = trip.metadata || {};
                    if (!metadata.plans) {
                        metadata.plans = {};
                    }
                    metadata.plans[newPlanId] = {
                        planVersion: planState.plan_version,
                        status: planState.status,
                        uiOutput,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        createdBy: existingPlan.createdBy,
                    };
                    await this.prisma.trip.update({
                        where: { id: existingPlan.tripId },
                        data: {
                            metadata: metadata,
                            updatedAt: new Date(),
                        },
                    });
                }
            }
            return {
                newPlanId,
                newPlanVersion: planState.plan_version,
                planState,
                uiOutput,
                changes,
            };
        }
        else {
            planState.plan_version = (planState.plan_version || 1) + 1;
            planState.status = 'DRAFT';
            if (this.stateStore) {
                const currentVersion = await this.stateStore.getVersion(planId, 'PlanState');
                if (currentVersion !== null) {
                    await this.stateStore.update(planId, 'PlanState', [{ op: 'replace', path: '/', value: planState }], currentVersion, 'PlanningWorkbenchAgentService', `adjust_${planId}`, {
                        action: 'adjust',
                        reason: `Adjust plan: ${adjustments.map(a => a.type).join(', ')}`,
                    });
                }
            }
            return {
                newPlanId: planId,
                newPlanVersion: planState.plan_version,
                planState,
                uiOutput,
                changes,
            };
        }
    }
    async savePlan(planState, uiOutput, tripId) {
        var _a, _b, _c, _d, _e, _f, _g;
        const planId = planState.plan_id;
        if (this.stateStore) {
            const currentVersion = await this.stateStore.getVersion(planId, 'PlanState');
            if (currentVersion !== null) {
                await this.stateStore.update(planId, 'PlanState', [{ op: 'replace', path: '/', value: planState }], currentVersion, 'PlanningWorkbenchAgentService', `save_${planId}`, {
                    action: 'save',
                    reason: 'Save plan after execution',
                });
            }
            else {
                await this.stateStore.create(planId, 'PlanState', planState, 'PlanningWorkbenchAgentService', `save_${planId}`);
            }
        }
        if (this.prisma) {
            try {
                const trip = await this.prisma.trip.findUnique({
                    where: { id: tripId },
                    select: { metadata: true },
                });
                if (trip) {
                    const metadata = trip.metadata || {};
                    if (!metadata.plans) {
                        metadata.plans = {};
                    }
                    const summary = {
                        itemCount: ((_b = (_a = planState.itinerary) === null || _a === void 0 ? void 0 : _a.segments) === null || _b === void 0 ? void 0 : _b.length) || 0,
                        days: planState.constraints.time.days,
                        budget: ((_c = planState.budget) === null || _c === void 0 ? void 0 : _c.breakdown)
                            ? {
                                total: ((_d = planState.budget.breakdown.categories) === null || _d === void 0 ? void 0 : _d.reduce((sum, cat) => sum + (cat.estimated || 0), 0)) || 0,
                                currency: ((_e = planState.constraints.budget) === null || _e === void 0 ? void 0 : _e.currency) || 'CNY',
                            }
                            : undefined,
                        consolidatedDecision: uiOutput.personas
                            ? {
                                status: planState.gate.status,
                                summary: ((_f = uiOutput.personas.consolidatedDecision) === null || _f === void 0 ? void 0 : _f.summary) || '',
                            }
                            : undefined,
                        personas: ((_g = uiOutput.personas) === null || _g === void 0 ? void 0 : _g.personas)
                            ? {
                                abu: uiOutput.personas.personas.abu ? { verdict: uiOutput.personas.personas.abu.verdict } : undefined,
                                drdre: uiOutput.personas.personas.drdre ? { verdict: uiOutput.personas.personas.drdre.verdict } : undefined,
                                neptune: uiOutput.personas.personas.neptune ? { verdict: uiOutput.personas.personas.neptune.verdict } : undefined,
                            }
                            : undefined,
                    };
                    metadata.plans[planId] = {
                        planVersion: planState.plan_version || 1,
                        status: planState.status,
                        uiOutput,
                        summary,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    };
                    metadata.currentPlanId = planId;
                    metadata.lastCommittedPlanId = planState.status === 'LOCKED' ? planId : metadata.lastCommittedPlanId;
                    await this.prisma.trip.update({
                        where: { id: tripId },
                        data: {
                            metadata: metadata,
                            updatedAt: new Date(),
                        },
                    });
                    this.logger.debug(`方案已保存到 Trip metadata: planId=${planId}, tripId=${tripId}`);
                }
            }
            catch (error) {
                this.logger.warn(`保存方案到 Trip metadata 失败: ${error.message}`);
            }
        }
    }
    async getWorldModelData(context) {
        var _a, _b, _c, _d, _e, _f;
        const result = {};
        const promises = [];
        const startDate = (_b = (_a = context.constraints) === null || _a === void 0 ? void 0 : _a.time) === null || _b === void 0 ? void 0 : _b.startDate;
        const endDate = (_d = (_c = context.constraints) === null || _c === void 0 ? void 0 : _c.time) === null || _d === void 0 ? void 0 : _d.endDate;
        const hasDates = !!(startDate && endDate);
        if (this.costAgent && context.destination && hasDates) {
            const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
            promises.push(this.costAgent.estimateTripCost(context.destination.country || context.destination.city || '', { start: startDate, end: endDate }, ((_f = (_e = context.constraints) === null || _e === void 0 ? void 0 : _e.companions) === null || _f === void 0 ? void 0 : _f.count) || 2).then(data => { result.cost = data; }).catch(e => {
                this.logger.warn(`[WorldModel] CostAgent failed: ${e.message}`);
            }));
        }
        await Promise.all(promises);
        this.logger.debug(`[WorldModel] Data collected: geo=${!!result.geo}, weather=${!!result.weather}, cost=${!!result.cost}`);
        return result;
    }
};
exports.PlanningWorkbenchAgentService = PlanningWorkbenchAgentService;
exports.PlanningWorkbenchAgentService = PlanningWorkbenchAgentService = PlanningWorkbenchAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
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
    __param(22, (0, common_1.Optional)()),
    __param(23, (0, common_1.Optional)()),
    __param(24, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [context_build_skill_1.ContextBuildSkill,
        plan_architect_generate_skeleton_skill_1.PlanArchitectGenerateSkeletonSkill,
        plan_architect_compare_options_skill_1.PlanArchitectCompareOptionsSkill,
        plan_architect_commit_option_skill_1.PlanArchitectCommitOptionSkill,
        plan_budget_estimate_baseline_skill_1.PlanBudgetEstimateBaselineSkill,
        plan_budget_detect_overrun_skill_1.PlanBudgetDetectOverrunSkill,
        plan_transit_build_transfer_graph_skill_1.PlanTransitBuildTransferGraphSkill,
        plan_pace_compute_time_windows_skill_1.PlanPaceComputeTimeWindowsSkill,
        plan_pace_fatigue_score_skill_1.PlanPaceFatigueScoreSkill,
        plan_gate_precheck_skill_1.PlanGatePrecheckSkill,
        plan_gate_run_three_guardians_skill_1.PlanGateRunThreeGuardiansSkill,
        plan_constraints_detect_conflicts_skill_1.PlanConstraintsDetectConflictsSkill,
        plan_log_append_decision_skill_1.PlanLogAppendDecisionSkill,
        persona_shell_service_1.PersonaShellService,
        prisma_service_1.PrismaService,
        state_store_service_1.StateStoreService,
        trip_run_manager_service_1.TripRunManagerService,
        decision_draft_storage_service_1.DecisionDraftStorageService,
        geo_agent_service_1.GeoAgentService,
        weather_agent_service_1.WeatherAgentService,
        cost_agent_service_1.CostAgentService,
        experience_agent_service_1.ExperienceAgentService,
        dem_effort_metadata_service_1.DEMEffortMetadataService,
        geo_facts_service_1.GeoFactsService,
        geo_check_hazard_zones_skill_1.GeoCheckHazardZonesSkill])
], PlanningWorkbenchAgentService);
//# sourceMappingURL=planning-workbench-agent.service.js.map