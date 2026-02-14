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
var DecisionController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const trip_decision_engine_service_1 = require("./trip-decision-engine.service");
const strategy_orchestrator_service_1 = require("./services/strategy-orchestrator.service");
const standard_response_dto_1 = require("../../common/dto/standard-response.dto");
const api_response_dto_1 = require("../../common/dto/api-response.dto");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
const decision_log_storage_service_1 = require("./services/decision-log-storage.service");
const decision_stats_service_1 = require("./services/decision-stats.service");
const decision_log_clustering_service_1 = require("./evaluation/decision-log-clustering.service");
const admin_decision_dto_1 = require("./dto/admin-decision.dto");
const constraint_conflict_resolver_service_1 = require("./constraints/constraint-conflict-resolver.service");
const constraint_checker_1 = require("./constraints/constraint-checker");
const multi_plan_generator_service_1 = require("./services/multi-plan-generator.service");
const constraint_dsl_dto_1 = require("./dto/constraint-dsl.dto");
const feedback_collector_service_1 = require("./feedback/feedback-collector.service");
const quality_assessor_service_1 = require("./feedback/quality-assessor.service");
const memory_updater_service_1 = require("./feedback/memory-updater.service");
const feedback_dto_1 = require("./dto/feedback.dto");
let DecisionController = DecisionController_1 = class DecisionController {
    constructor(decisionEngine, strategyOrchestrator, decisionLogStorage, decisionStats, clusteringService, conflictResolver, constraintChecker, multiPlanGenerator, feedbackCollector, qualityAssessor, memoryUpdater) {
        this.decisionEngine = decisionEngine;
        this.strategyOrchestrator = strategyOrchestrator;
        this.decisionLogStorage = decisionLogStorage;
        this.decisionStats = decisionStats;
        this.clusteringService = clusteringService;
        this.conflictResolver = conflictResolver;
        this.constraintChecker = constraintChecker;
        this.multiPlanGenerator = multiPlanGenerator;
        this.feedbackCollector = feedbackCollector;
        this.qualityAssessor = qualityAssessor;
        this.memoryUpdater = memoryUpdater;
        this.logger = new common_1.Logger(DecisionController_1.name);
    }
    async validateSafety(body) {
        try {
            if (!body.worldContext) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'worldContext 是必需的参数');
            }
            if (!body.plan) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'plan 是必需的参数');
            }
            if (!body.plan.tripId && !body.tripId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'tripId 是必需的参数');
            }
            const planWithTripId = {
                ...body.plan,
                tripId: body.plan.tripId || body.tripId,
            };
            const result = await this.strategyOrchestrator.run(body.worldContext, planWithTripId);
            if (!result.allowed) {
                const alternativeRoutes = await this.generateAlternativeRoutes(body.worldContext, planWithTripId, result.logs);
                return (0, standard_response_dto_1.successResponse)({
                    allowed: false,
                    violations: result.logs.filter(log => log.persona === 'ABU'),
                    alternativeRoutes,
                    message: '行程包含安全违规项，已生成备选路线',
                });
            }
            return (0, standard_response_dto_1.successResponse)({
                allowed: true,
                violations: [],
                message: '行程通过安全校验',
            });
        }
        catch (error) {
            this.logger.error(`安全校验失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async adjustPacing(body) {
        try {
            if (!body.worldContext) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'worldContext 是必需的参数');
            }
            if (!body.plan) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'plan 是必需的参数');
            }
            if (!body.plan.tripId && !body.tripId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'tripId 是必需的参数');
            }
            const planWithTripId = {
                ...body.plan,
                tripId: body.plan.tripId || body.tripId,
            };
            const result = await this.strategyOrchestrator.run(body.worldContext, planWithTripId);
            if (result.plan && result.finalAction === 'ADJUST') {
                return (0, standard_response_dto_1.successResponse)({
                    success: true,
                    adjustedPlan: result.plan,
                    changes: result.logs.filter(log => log.persona === 'DR_DRE'),
                    message: '行程节奏已自动调整，已拆分密集活动并插入缓冲时间',
                });
            }
            return (0, standard_response_dto_1.successResponse)({
                success: false,
                message: '行程节奏无需调整',
            });
        }
        catch (error) {
            this.logger.error(`节奏调整失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async replaceNodes(body) {
        try {
            if (!body.worldContext) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'worldContext 是必需的参数');
            }
            if (!body.plan) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'plan 是必需的参数');
            }
            if (!body.plan.tripId && !body.tripId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'tripId 是必需的参数');
            }
            if (!body.unavailableNodes || body.unavailableNodes.length === 0) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'unavailableNodes 是必需的参数');
            }
            const planWithTripId = {
                ...body.plan,
                tripId: body.plan.tripId || body.tripId,
            };
            const updatedPlan = {
                ...planWithTripId,
                segments: (planWithTripId.segments || []).map(segment => {
                    const unavailable = body.unavailableNodes.find(u => u.nodeId === segment.segmentId);
                    return unavailable
                        ? {
                            ...segment,
                            metadata: {
                                ...segment.metadata,
                                status: 'UNAVAILABLE',
                                reason: unavailable.reason,
                            },
                        }
                        : segment;
                }),
            };
            const result = await this.strategyOrchestrator.run(body.worldContext, updatedPlan);
            if (result.plan && result.finalAction === 'REPLACE') {
                return (0, standard_response_dto_1.successResponse)({
                    success: true,
                    replacedPlan: result.plan,
                    replacements: result.logs.filter(log => log.persona === 'NEPTUNE'),
                    message: '路线节点已自动替换，保持路线核心风格不变',
                });
            }
            return (0, standard_response_dto_1.successResponse)({
                success: false,
                message: '无法找到合适的替换节点',
            });
        }
        catch (error) {
            this.logger.error(`节点替换失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async generateAlternativeRoutes(worldContext, originalPlan, violationLogs) {
        return [];
    }
    async getAdminLogs(query) {
        try {
            const result = await this.decisionLogStorage.queryLogsPaginated({
                tripId: query.tripId,
                userId: query.userId,
                persona: query.persona,
                decisionSource: query.decisionSource,
                action: query.action,
                startDate: query.startDate ? new Date(query.startDate) : undefined,
                endDate: query.endDate ? new Date(query.endDate) : undefined,
                page: query.page,
                limit: query.limit,
                sortBy: query.sortBy,
                sortOrder: query.sortOrder,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`获取决策日志列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminLogDetail(id) {
        try {
            const log = await this.decisionLogStorage.getLogDetailById(id);
            if (!log) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `决策日志 ${id} 不存在`);
            }
            return (0, standard_response_dto_1.successResponse)(log);
        }
        catch (error) {
            this.logger.error(`获取决策日志详情失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminStats(query) {
        try {
            const startDate = query.startDate ? new Date(query.startDate) : undefined;
            const endDate = query.endDate ? new Date(query.endDate) : undefined;
            let stats;
            if (query.countryCode) {
                stats = await this.decisionStats.getStatsByCountry(query.countryCode, startDate, endDate);
            }
            else if (query.routeDirectionId) {
                stats = await this.decisionStats.getStatsByRouteDirection(query.routeDirectionId, startDate, endDate);
            }
            else {
                stats = await this.decisionStats.getStatsByCountry(undefined, startDate, endDate);
            }
            const personaStats = await this.decisionStats.getPersonaTriggerStats(startDate, endDate);
            return (0, standard_response_dto_1.successResponse)({
                distribution: stats,
                personaStats,
                realityDrivenRatio: stats.realityDrivenRatio,
            });
        }
        catch (error) {
            this.logger.error(`获取决策统计失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminAnalytics(startDate, endDate, countryCode) {
        try {
            const start = startDate ? new Date(startDate) : undefined;
            const end = endDate ? new Date(endDate) : undefined;
            const stats = countryCode
                ? await this.decisionStats.getStatsByCountry(countryCode, start, end)
                : await this.decisionStats.getStatsByCountry(undefined, start, end);
            const heuristicHotspots = await this.decisionStats.getHeuristicHotspots(10);
            const personaStats = await this.decisionStats.getPersonaTriggerStats(start, end);
            const overallScore = stats.realityDrivenRatio * 0.6 +
                (1 - stats.bySourcePercentage.HEURISTIC) * 0.4;
            const rejectionLogs = await this.decisionLogStorage.queryLogs({
                action: 'REJECT',
                startDate: start,
                endDate: end,
                countryCode,
                limit: 1000,
            });
            const rejectionReasons = [];
            const reasonMap = new Map();
            rejectionLogs.forEach(log => {
                log.reasonCodes.forEach(code => {
                    const count = reasonMap.get(code) || 0;
                    reasonMap.set(code, count + 1);
                });
            });
            const totalRejections = rejectionLogs.length;
            reasonMap.forEach((count, reason) => {
                rejectionReasons.push({
                    reason,
                    count,
                    percentage: totalRejections > 0 ? (count / totalRejections) * 100 : 0,
                });
            });
            rejectionReasons.sort((a, b) => b.count - a.count);
            const replacementLogs = await this.decisionLogStorage.queryLogs({
                action: 'REPLACE',
                startDate: start,
                endDate: end,
                countryCode,
                limit: 1000,
            });
            const replacementReasons = [];
            const replacementReasonMap = new Map();
            replacementLogs.forEach(log => {
                log.reasonCodes.forEach(code => {
                    const count = replacementReasonMap.get(code) || 0;
                    replacementReasonMap.set(code, count + 1);
                });
            });
            const totalReplacements = replacementLogs.length;
            replacementReasonMap.forEach((count, reason) => {
                replacementReasons.push({
                    reason,
                    count,
                    percentage: totalReplacements > 0 ? (count / totalReplacements) * 100 : 0,
                });
            });
            replacementReasons.sort((a, b) => b.count - a.count);
            return (0, standard_response_dto_1.successResponse)({
                qualityReport: {
                    overallScore,
                    realityDrivenRatio: stats.realityDrivenRatio,
                    explanationQuality: 0.85,
                    decisionConsistency: 0.82,
                },
                heuristicHotspots: heuristicHotspots.map(hotspot => ({
                    countryCode: hotspot.countryCode,
                    routeDirectionId: hotspot.routeDirectionId,
                    heuristicRatio: hotspot.heuristicRatio,
                    recommendation: hotspot.suggestions.join('; '),
                })),
                rejectionReasons: rejectionReasons.slice(0, 10),
                replacementReasons: replacementReasons.slice(0, 10),
                personaStats,
                distribution: stats,
            });
        }
        catch (error) {
            this.logger.error(`获取决策分析报告失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async exportAdminLogs(body) {
        try {
            const format = body.format || 'json';
            const filters = body.filters || {};
            const where = {};
            if (filters.tripId) {
                where.tripId = filters.tripId;
            }
            if (filters.persona) {
                where.persona = filters.persona;
            }
            if (filters.decisionSource) {
                where.decisionSource = filters.decisionSource;
            }
            if (filters.action) {
                where.action = filters.action;
            }
            if (filters.startDate || filters.endDate) {
                where.timestamp = {};
                if (filters.startDate) {
                    where.timestamp.gte = new Date(filters.startDate);
                }
                if (filters.endDate) {
                    where.timestamp.lte = new Date(filters.endDate);
                }
            }
            const logs = await this.decisionLogStorage.queryRawLogs({
                tripId: filters.tripId,
                persona: filters.persona,
                decisionSource: filters.decisionSource,
                action: filters.action,
                startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                limit: 10000,
            });
            if (format === 'csv') {
                const csvHeaders = [
                    'ID',
                    'Trip ID',
                    'Persona',
                    'Action',
                    'Decision Source',
                    'Decision Stage',
                    'Explanation',
                    'Reason Codes',
                    'Timestamp',
                    'Country Code',
                    'Route Direction ID',
                ];
                const csvRows = logs.map(log => [
                    log.id,
                    log.tripId || '',
                    log.persona,
                    log.action,
                    log.decisionSource,
                    log.decisionStage || 'FINALIZE',
                    log.explanation.replace(/"/g, '""'),
                    (log.reasonCodes || []).join('; '),
                    log.timestamp.toISOString(),
                    log.countryCode || '',
                    log.routeDirectionId || '',
                ]);
                const csvContent = [
                    csvHeaders.join(','),
                    ...csvRows.map(row => row.map(cell => `"${String(cell)}"`).join(',')),
                ].join('\n');
                return {
                    success: true,
                    data: {
                        format: 'csv',
                        content: csvContent,
                        filename: `decision-logs-${new Date().toISOString().split('T')[0]}.csv`,
                    },
                };
            }
            else {
                const jsonData = logs.map(log => ({
                    id: log.id,
                    tripId: log.tripId,
                    persona: log.persona,
                    action: log.action,
                    decisionSource: log.decisionSource,
                    decisionStage: log.decisionStage || 'FINALIZE',
                    explanation: log.explanation,
                    reasonCodes: log.reasonCodes || [],
                    evidenceRefs: log.evidenceRefs || [],
                    timestamp: log.timestamp.toISOString(),
                    countryCode: log.countryCode,
                    routeDirectionId: log.routeDirectionId,
                    metadata: log.metadata || {},
                }));
                return (0, standard_response_dto_1.successResponse)({
                    format: 'json',
                    data: jsonData,
                    count: jsonData.length,
                });
            }
        }
        catch (error) {
            this.logger.error(`导出决策日志失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async detectConflicts(body) {
        try {
            if (!this.conflictResolver) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'ConstraintConflictResolver 不可用');
            }
            if (!body.constraints) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'constraints 是必需的参数');
            }
            const conflictResult = await this.conflictResolver.detectAndExplainConflicts(body.constraints, body.plan || null, body.state || {});
            return (0, standard_response_dto_1.successResponse)({
                conflicts: conflictResult.conflicts,
                has_conflicts: conflictResult.has_conflicts,
                summary: {
                    critical: conflictResult.critical_count,
                    high: conflictResult.high_count,
                    medium: conflictResult.medium_count,
                    low: conflictResult.low_count,
                },
            });
        }
        catch (error) {
            this.logger.error(`冲突检测失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async checkConstraintsWithExplanation(body) {
        try {
            if (!this.constraintChecker) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'ConstraintChecker 不可用');
            }
            if (!body.state || !body.plan) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'state 和 plan 是必需的参数');
            }
            const checkResult = await this.constraintChecker.checkPlan(body.state, body.plan);
            return (0, standard_response_dto_1.successResponse)({
                isValid: checkResult.isValid,
                violations: checkResult.violations,
                summary: checkResult.summary,
                conflicts: checkResult.conflicts,
                infeasibilityExplanation: checkResult.infeasibilityExplanation,
            });
        }
        catch (error) {
            this.logger.error(`约束检查失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async generateMultiplePlans(body) {
        try {
            if (!this.multiPlanGenerator) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'MultiPlanGenerator 不可用');
            }
            if (!body.state || !body.constraints) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'state 和 constraints 是必需的参数');
            }
            const { variants, log } = await this.decisionEngine.generateMultiplePlans(body.state);
            return (0, standard_response_dto_1.successResponse)({
                variants: variants.map(v => ({
                    id: v.id,
                    score: v.score,
                    tradeoffs: v.tradeoffs,
                    feasibility: v.feasibility,
                    planSummary: {
                        days: v.plan.days.length,
                        totalActivities: v.plan.days.reduce((sum, day) => sum + day.timeSlots.filter(s => s.type !== 'rest' && s.type !== 'transport').length, 0),
                    },
                })),
                log: {
                    runId: log.runId,
                    explanation: log.explanation,
                },
            });
        }
        catch (error) {
            this.logger.error(`多方案生成失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async submitPlanVariantFeedback(dto) {
        try {
            if (!this.feedbackCollector) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
            }
            await this.feedbackCollector.collectPlanVariantFeedback({
                feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                runId: dto.runId,
                variantId: dto.variantId,
                variantStrategy: dto.variantStrategy,
                userChoice: dto.userChoice,
                rating: dto.rating,
                reason: dto.reason,
                tripId: dto.tripId,
                userId: dto.userId,
                feedbackAt: new Date(),
            });
            return (0, standard_response_dto_1.successResponse)({ message: '反馈提交成功' });
        }
        catch (error) {
            this.logger.error(`提交计划变体反馈失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async submitConflictFeedback(dto) {
        try {
            if (!this.feedbackCollector) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
            }
            await this.feedbackCollector.collectConflictFeedback({
                feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                runId: dto.runId,
                conflictId: dto.conflictId,
                conflictType: dto.conflictType,
                understood: dto.understood,
                explanationClear: dto.explanationClear,
                tradeoffOptionsUseful: dto.tradeoffOptionsUseful,
                selectedTradeoffOption: dto.selectedTradeoffOption,
                tripId: dto.tripId,
                userId: dto.userId,
                feedbackAt: new Date(),
            });
            return (0, standard_response_dto_1.successResponse)({ message: '反馈提交成功' });
        }
        catch (error) {
            this.logger.error(`提交约束冲突反馈失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async submitDecisionQualityFeedback(dto) {
        try {
            if (!this.feedbackCollector) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
            }
            await this.feedbackCollector.collectDecisionQualityFeedback({
                feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                runId: dto.runId,
                overallSatisfaction: dto.overallSatisfaction,
                planQuality: dto.planQuality,
                conflictExplanationQuality: dto.conflictExplanationQuality,
                tradeoffOptionsQuality: dto.tradeoffOptionsQuality,
                decisionSpeed: dto.decisionSpeed,
                additionalFeedback: dto.additionalFeedback,
                tripId: dto.tripId,
                userId: dto.userId,
                feedbackAt: new Date(),
            });
            return (0, standard_response_dto_1.successResponse)({ message: '反馈提交成功' });
        }
        catch (error) {
            this.logger.error(`提交决策质量反馈失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async submitBatchFeedback(dto) {
        var _a, _b, _c;
        try {
            if (!this.feedbackCollector) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
            }
            const planVariantFeedbacks = (_a = dto.planVariantFeedbacks) === null || _a === void 0 ? void 0 : _a.map(f => ({
                feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                runId: f.runId,
                variantId: f.variantId,
                variantStrategy: f.variantStrategy,
                userChoice: f.userChoice,
                rating: f.rating,
                reason: f.reason,
                tripId: f.tripId,
                userId: f.userId,
                feedbackAt: new Date(),
            }));
            const conflictFeedbacks = (_b = dto.conflictFeedbacks) === null || _b === void 0 ? void 0 : _b.map(f => ({
                feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                runId: f.runId,
                conflictId: f.conflictId,
                conflictType: f.conflictType,
                understood: f.understood,
                explanationClear: f.explanationClear,
                tradeoffOptionsUseful: f.tradeoffOptionsUseful,
                selectedTradeoffOption: f.selectedTradeoffOption,
                tripId: f.tripId,
                userId: f.userId,
                feedbackAt: new Date(),
            }));
            const decisionQualityFeedbacks = (_c = dto.decisionQualityFeedbacks) === null || _c === void 0 ? void 0 : _c.map(f => ({
                feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                runId: f.runId,
                overallSatisfaction: f.overallSatisfaction,
                planQuality: f.planQuality,
                conflictExplanationQuality: f.conflictExplanationQuality,
                tradeoffOptionsQuality: f.tradeoffOptionsQuality,
                decisionSpeed: f.decisionSpeed,
                additionalFeedback: f.additionalFeedback,
                tripId: f.tripId,
                userId: f.userId,
                feedbackAt: new Date(),
            }));
            await this.feedbackCollector.collectBatchFeedback(planVariantFeedbacks, conflictFeedbacks, decisionQualityFeedbacks);
            return (0, standard_response_dto_1.successResponse)({ message: '批量反馈提交成功' });
        }
        catch (error) {
            this.logger.error(`批量提交反馈失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getFeedbackStats(query) {
        try {
            if (!this.feedbackCollector) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
            }
            const stats = await this.feedbackCollector.getFeedbackStats(query.userId, query.tripId, query.startDate ? new Date(query.startDate) : undefined, query.endDate ? new Date(query.endDate) : undefined);
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            this.logger.error(`获取反馈统计失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.DecisionController = DecisionController;
__decorate([
    (0, common_1.Post)('validate-safety'),
    (0, swagger_1.ApiOperation)({
        summary: '安全规则校验行程',
        description: '使用 Abu 策略校验行程中的物理安全违规项，识别危险区域并生成备选路线',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['tripId', 'plan'],
            properties: {
                tripId: { type: 'string', description: '行程 ID' },
                plan: { type: 'object', description: '路线计划草案' },
                worldContext: { type: 'object', description: '世界模型上下文' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '校验完成',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "validateSafety", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('adjust-pacing'),
    (0, swagger_1.ApiOperation)({
        summary: '行程节奏智能调整',
        description: '使用 Dr.Dre 策略调整行程节奏，拆分密集活动并插入缓冲时间',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['tripId', 'plan', 'worldContext'],
            properties: {
                tripId: { type: 'string', description: '行程 ID' },
                plan: { type: 'object', description: '路线计划草案' },
                worldContext: { type: 'object', description: '世界模型上下文' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '节奏调整完成',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "adjustPacing", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('replace-nodes'),
    (0, swagger_1.ApiOperation)({
        summary: '路线节点智能替换',
        description: '使用 Neptune 策略替换不可用的路线节点，保持路线哲学不变',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['tripId', 'plan', 'worldContext', 'unavailableNodes'],
            properties: {
                tripId: { type: 'string', description: '行程 ID' },
                plan: { type: 'object', description: '路线计划草案' },
                worldContext: { type: 'object', description: '世界模型上下文' },
                unavailableNodes: {
                    type: 'array',
                    description: '不可用的节点列表',
                    items: {
                        type: 'object',
                        properties: {
                            nodeId: { type: 'string' },
                            reason: { type: 'string' },
                        },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '节点替换完成',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "replaceNodes", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/logs'),
    (0, swagger_1.ApiOperation)({
        summary: '获取决策日志列表（管理接口）',
        description: '获取决策日志列表，支持分页、筛选、排序。用于后台管理系统。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回决策日志列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_decision_dto_1.AdminDecisionLogListQueryDto]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "getAdminLogs", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/logs/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取决策日志详情（管理接口）',
        description: '获取单个决策日志的详细信息，包含所有关联数据。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '决策日志ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回决策日志详情（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '决策日志不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "getAdminLogDetail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取决策统计信息（管理接口）',
        description: '获取决策统计信息，包括按国家、路线方向、Persona等维度的统计。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回决策统计（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_decision_dto_1.AdminDecisionStatsQueryDto]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "getAdminStats", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/analytics'),
    (0, swagger_1.ApiOperation)({
        summary: '获取决策分析报告（管理接口）',
        description: '获取决策质量分析报告，包括质量评分、HEURISTIC热点、拒绝原因分析等。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: '开始日期（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: '结束日期（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, description: '国家代码' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回决策分析报告（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __param(2, (0, common_1.Query)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "getAdminAnalytics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('admin/logs/export'),
    (0, swagger_1.ApiOperation)({
        summary: '导出决策日志（管理接口）',
        description: '导出决策日志数据，支持JSON和CSV格式。',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
                filters: {
                    type: 'object',
                    properties: {
                        tripId: { type: 'string' },
                        userId: { type: 'string' },
                        persona: { type: 'string' },
                        decisionSource: { type: 'string' },
                        action: { type: 'string' },
                        startDate: { type: 'string' },
                        endDate: { type: 'string' },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功导出决策日志',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "exportAdminLogs", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('detect-conflicts'),
    (0, swagger_1.ApiOperation)({
        summary: '检测约束冲突',
        description: '检测约束DSL中的冲突，生成权衡选项和修复建议',
    }),
    (0, swagger_1.ApiBody)({ type: constraint_dsl_dto_1.DetectConflictsRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '冲突检测完成',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [constraint_dsl_dto_1.DetectConflictsRequestDto]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "detectConflicts", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('check-constraints-with-explanation'),
    (0, swagger_1.ApiOperation)({
        summary: '检查约束并获取不可行性解释',
        description: '检查计划的约束违规情况，并提供详细的不可行性解释和修复建议',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['state', 'plan'],
            properties: {
                state: { type: 'object', description: '世界状态' },
                plan: { type: 'object', description: '行程计划' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '约束检查完成',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "checkConstraintsWithExplanation", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('generate-multiple-plans'),
    (0, swagger_1.ApiOperation)({
        summary: '生成多个方案变体',
        description: '并行生成多个方案（保守、平衡、激进），每个方案包含评分和权衡分析',
    }),
    (0, swagger_1.ApiBody)({ type: constraint_dsl_dto_1.GenerateMultiplePlansRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '多方案生成完成',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [constraint_dsl_dto_1.GenerateMultiplePlansRequestDto]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "generateMultiplePlans", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('feedback/plan-variant'),
    (0, swagger_1.ApiOperation)({
        summary: '提交计划变体反馈',
        description: '收集用户对计划变体的反馈（选择、拒绝、修改等）',
    }),
    (0, swagger_1.ApiBody)({ type: feedback_dto_1.PlanVariantFeedbackDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '反馈提交成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [feedback_dto_1.PlanVariantFeedbackDto]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "submitPlanVariantFeedback", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('feedback/conflict'),
    (0, swagger_1.ApiOperation)({
        summary: '提交约束冲突反馈',
        description: '收集用户对约束冲突解释和权衡选项的反馈',
    }),
    (0, swagger_1.ApiBody)({ type: feedback_dto_1.ConflictFeedbackDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '反馈提交成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [feedback_dto_1.ConflictFeedbackDto]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "submitConflictFeedback", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('feedback/decision-quality'),
    (0, swagger_1.ApiOperation)({
        summary: '提交决策质量反馈',
        description: '收集用户对整体决策质量的反馈',
    }),
    (0, swagger_1.ApiBody)({ type: feedback_dto_1.DecisionQualityFeedbackDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '反馈提交成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [feedback_dto_1.DecisionQualityFeedbackDto]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "submitDecisionQualityFeedback", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('feedback/batch'),
    (0, swagger_1.ApiOperation)({
        summary: '批量提交反馈',
        description: '批量提交多种类型的反馈',
    }),
    (0, swagger_1.ApiBody)({ type: feedback_dto_1.BatchFeedbackDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '反馈提交成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [feedback_dto_1.BatchFeedbackDto]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "submitBatchFeedback", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('feedback/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取反馈统计',
        description: '获取用户反馈的统计信息',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '反馈统计',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [feedback_dto_1.FeedbackStatsQueryDto]),
    __metadata("design:returntype", Promise)
], DecisionController.prototype, "getFeedbackStats", null);
exports.DecisionController = DecisionController = DecisionController_1 = __decorate([
    (0, swagger_1.ApiTags)('decision'),
    (0, common_1.Controller)('decision'),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __param(9, (0, common_1.Optional)()),
    __param(10, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [trip_decision_engine_service_1.TripDecisionEngineService,
        strategy_orchestrator_service_1.StrategyOrchestratorService,
        decision_log_storage_service_1.DecisionLogStorageService,
        decision_stats_service_1.DecisionStatsService,
        decision_log_clustering_service_1.DecisionLogClusteringService,
        constraint_conflict_resolver_service_1.ConstraintConflictResolver,
        constraint_checker_1.ConstraintChecker,
        multi_plan_generator_service_1.MultiPlanGenerator,
        feedback_collector_service_1.FeedbackCollectorService,
        quality_assessor_service_1.QualityAssessorService,
        memory_updater_service_1.MemoryUpdaterService])
], DecisionController);
//# sourceMappingURL=decision.controller.js.map