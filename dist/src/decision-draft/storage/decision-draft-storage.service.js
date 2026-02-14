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
var DecisionDraftStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionDraftStorageService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let DecisionDraftStorageService = DecisionDraftStorageService_1 = class DecisionDraftStorageService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DecisionDraftStorageService_1.name);
    }
    async saveDecisionDraft(decisionDraft) {
        var _a, _b;
        this.logger.log(`[DecisionDraftStorage] 保存决策草案: draft_id=${decisionDraft.draft_id}`);
        try {
            const workflowId = decisionDraft.plan_id || decisionDraft.workflow_id || decisionDraft.draft_id;
            const createData = {
                draftId: decisionDraft.draft_id,
                workflowId: workflowId,
                version: ((_a = decisionDraft.plan_version) === null || _a === void 0 ? void 0 : _a.toString()) || decisionDraft.version || '1',
                stepDraftId: decisionDraft.step_draft_id,
                stepDraftData: decisionDraft.step_draft,
                executionResultId: decisionDraft.execution_result_id,
                executionResultData: decisionDraft.execution_result,
                userMode: decisionDraft.user_mode,
                decisionCount: decisionDraft.metadata.decision_count,
                stepCount: decisionDraft.metadata.step_count,
                createdBy: decisionDraft.metadata.created_by,
            };
            if (decisionDraft.debug_info) {
                createData.debugInfo = decisionDraft.debug_info;
            }
            const updateData = {
                workflowId: workflowId,
                version: ((_b = decisionDraft.plan_version) === null || _b === void 0 ? void 0 : _b.toString()) || decisionDraft.version || '1',
                stepDraftId: decisionDraft.step_draft_id,
                stepDraftData: decisionDraft.step_draft,
                executionResultId: decisionDraft.execution_result_id,
                executionResultData: decisionDraft.execution_result,
                userMode: decisionDraft.user_mode,
                decisionCount: decisionDraft.metadata.decision_count,
                stepCount: decisionDraft.metadata.step_count,
            };
            if (decisionDraft.debug_info) {
                updateData.debugInfo = decisionDraft.debug_info;
            }
            const savedDraft = await this.prisma.decisionDraft.upsert({
                where: { draftId: decisionDraft.draft_id },
                create: createData,
                update: updateData,
            });
            await this.saveDecisionSteps(decisionDraft.draft_id, decisionDraft.decision_steps);
            const fullDraft = await this.prisma.decisionDraft.findUnique({
                where: { draftId: decisionDraft.draft_id },
                include: {
                    decisionSteps: {
                        orderBy: { createdAt: 'asc' },
                    },
                },
            });
            if (!fullDraft) {
                throw new Error(`Failed to retrieve saved draft: ${decisionDraft.draft_id}`);
            }
            return this.mapToDecisionDraft(fullDraft, fullDraft.decisionSteps);
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] 保存决策草案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async saveDecisionSteps(draftId, decisionSteps) {
        const draft = await this.prisma.decisionDraft.findUnique({
            where: { draftId },
        });
        if (!draft) {
            throw new Error(`DecisionDraft not found: ${draftId}`);
        }
        await this.prisma.decisionStep.deleteMany({
            where: { decisionDraftId: draft.id },
        });
        await this.prisma.decisionStep.createMany({
            data: decisionSteps.map((step) => ({
                decisionDraftId: draft.id,
                stepId: step.id,
                title: step.title,
                description: step.description,
                decisionType: step.type,
                status: step.status,
                confidence: step.confidence,
                inputs: step.inputs,
                outputs: step.outputs,
                evidence: step.evidence,
                decisionLog: step.decision_log,
                stepDraftIds: step.step_draft_ids,
                guardianReview: step.guardian_review,
                userFeedback: step.user_feedback,
            })),
        });
    }
    async loadDecisionDraft(draftId) {
        this.logger.log(`[DecisionDraftStorage] 加载决策草案: draft_id=${draftId}`);
        try {
            const draft = await this.prisma.decisionDraft.findUnique({
                where: { draftId },
                include: {
                    decisionSteps: {
                        orderBy: { createdAt: 'asc' },
                    },
                },
            });
            if (!draft) {
                return null;
            }
            return this.mapToDecisionDraft(draft, draft.decisionSteps);
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] 加载决策草案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async loadDecisionDraftByWorkflowId(workflowId) {
        this.logger.log(`[DecisionDraftStorage] 根据 workflow_id 加载决策草案: workflow_id=${workflowId}`);
        try {
            const draft = await this.prisma.decisionDraft.findUnique({
                where: { workflowId },
                include: {
                    decisionSteps: {
                        orderBy: { createdAt: 'asc' },
                    },
                },
            });
            if (!draft) {
                return null;
            }
            return this.mapToDecisionDraft(draft, draft.decisionSteps);
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] 根据 workflow_id 加载决策草案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async loadDecisionDraftByTripId(tripId) {
        this.logger.log(`[DecisionDraftStorage] 根据 tripId 加载决策草案: tripId=${tripId}`);
        try {
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
                select: { metadata: true },
            });
            if (!trip) {
                this.logger.warn(`行程不存在: tripId=${tripId}`);
                return null;
            }
            const metadata = trip.metadata || {};
            const decisionDraftId = metadata.decisionDraftId;
            if (!decisionDraftId) {
                this.logger.debug(`行程 ${tripId} 没有关联的决策草案`);
                return null;
            }
            return await this.loadDecisionDraft(decisionDraftId);
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] 根据 tripId 加载决策草案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async deleteDecisionDraft(draftId) {
        this.logger.log(`[DecisionDraftStorage] 删除决策草案: draft_id=${draftId}`);
        try {
            await this.prisma.decisionDraft.delete({
                where: { draftId },
            });
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] 删除决策草案失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    mapToDecisionDraft(dbDraft, dbSteps) {
        const decisionSteps = dbSteps.map((dbStep) => ({
            id: dbStep.stepId,
            title: dbStep.title,
            description: dbStep.description || '',
            type: dbStep.decisionType,
            status: dbStep.status,
            confidence: dbStep.confidence,
            inputs: dbStep.inputs,
            outputs: dbStep.outputs,
            evidence: dbStep.evidence,
            decision_log: dbStep.decisionLog,
            step_draft_ids: dbStep.stepDraftIds,
            guardian_review: dbStep.guardianReview,
            user_feedback: dbStep.userFeedback,
            created_at: dbStep.createdAt
                ? (dbStep.createdAt instanceof Date
                    ? dbStep.createdAt.toISOString()
                    : new Date(dbStep.createdAt).toISOString())
                : new Date().toISOString(),
            updated_at: dbStep.updatedAt
                ? (dbStep.updatedAt instanceof Date
                    ? dbStep.updatedAt.toISOString()
                    : new Date(dbStep.updatedAt).toISOString())
                : new Date().toISOString(),
        }));
        return {
            draft_id: dbDraft.draftId,
            plan_id: dbDraft.workflowId,
            plan_version: parseInt(dbDraft.version || '1', 10),
            workflow_id: dbDraft.workflowId,
            version: dbDraft.version,
            decision_steps: decisionSteps,
            step_draft_id: dbDraft.stepDraftId || undefined,
            step_draft: dbDraft.stepDraftData,
            execution_result_id: dbDraft.executionResultId || undefined,
            execution_result: dbDraft.executionResultData,
            user_mode: dbDraft.userMode,
            debug_info: dbDraft.debugInfo,
            metadata: {
                decision_count: dbDraft.decisionCount,
                step_count: dbDraft.stepCount,
                created_by: dbDraft.createdBy,
                created_at: dbDraft.createdAt.toISOString(),
                updated_at: dbDraft.updatedAt.toISOString(),
            },
        };
    }
    async saveVersion(version) {
        var _a;
        this.logger.log(`[DecisionDraftStorage] 保存版本: version_id=${version.version_id}`);
        try {
            const workflowId = version.plan_id || version.workflow_id || version.version_id;
            const versionStr = version.version || ((_a = version.plan_version) === null || _a === void 0 ? void 0 : _a.toString()) || 'v1.0';
            await this.prisma.decisionDraftVersion.create({
                data: {
                    versionId: version.version_id,
                    workflowId: workflowId,
                    version: versionStr,
                    decisionDraftData: version.decision_draft,
                    stepDraftData: version.step_draft,
                    executionResultData: version.execution_result,
                    diffData: version.diff,
                    createdBy: version.created_by,
                    description: version.description,
                },
            });
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] 保存版本失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async loadVersion(versionId) {
        this.logger.log(`[DecisionDraftStorage] 加载版本: version_id=${versionId}`);
        try {
            const version = await this.prisma.decisionDraftVersion.findUnique({
                where: { versionId },
            });
            if (!version) {
                return null;
            }
            return {
                version_id: version.versionId,
                plan_id: version.workflowId,
                plan_version: parseInt(version.version || '1', 10),
                workflow_id: version.workflowId,
                version: version.version,
                decision_draft: version.decisionDraftData,
                step_draft: version.stepDraftData,
                execution_result: version.executionResultData,
                diff: version.diffData,
                created_by: version.createdBy,
                description: version.description || undefined,
                created_at: version.createdAt.toISOString(),
            };
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] 加载版本失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async loadVersions(workflowId) {
        this.logger.log(`[DecisionDraftStorage] 加载版本列表: workflow_id=${workflowId}`);
        try {
            const versions = await this.prisma.decisionDraftVersion.findMany({
                where: { workflowId },
                orderBy: { createdAt: 'desc' },
            });
            return versions.map((version) => {
                const decisionDraft = version.decisionDraftData;
                const planVersion = (decisionDraft === null || decisionDraft === void 0 ? void 0 : decisionDraft.plan_version) || parseInt(version.version || '1', 10);
                const planId = (decisionDraft === null || decisionDraft === void 0 ? void 0 : decisionDraft.plan_id) || version.workflowId;
                return {
                    version_id: version.versionId,
                    plan_id: planId,
                    plan_version: planVersion,
                    workflow_id: version.workflowId,
                    version: version.version,
                    decision_draft: decisionDraft,
                    step_draft: version.stepDraftData,
                    execution_result: version.executionResultData,
                    diff: version.diffData,
                    created_by: version.createdBy,
                    description: version.description || undefined,
                    created_at: version.createdAt.toISOString(),
                };
            });
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] 加载版本列表失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async listDecisionDrafts(options) {
        this.logger.log(`[DecisionDraftStorage] [Admin] 分页获取决策草案: page=${options.page}, pageSize=${options.pageSize}`);
        try {
            const where = {};
            if (options.startDate || options.endDate) {
                where.createdAt = {};
                if (options.startDate) {
                    where.createdAt.gte = new Date(options.startDate);
                }
                if (options.endDate) {
                    where.createdAt.lte = new Date(options.endDate);
                }
            }
            const orderBy = {};
            const sortField = options.sortBy || 'createdAt';
            const sortDirection = options.sortOrder || 'desc';
            if (sortField === 'step_count') {
                orderBy.stepCount = sortDirection;
            }
            else if (sortField === 'created_at') {
                orderBy.createdAt = sortDirection;
            }
            else if (sortField === 'updated_at') {
                orderBy.updatedAt = sortDirection;
            }
            else {
                orderBy.createdAt = sortDirection;
            }
            const total = await this.prisma.decisionDraft.count({ where });
            const drafts = await this.prisma.decisionDraft.findMany({
                where,
                include: {
                    decisionSteps: {
                        orderBy: { createdAt: 'asc' },
                    },
                },
                orderBy,
                skip: (options.page - 1) * options.pageSize,
                take: options.pageSize,
            });
            const items = await Promise.all(drafts.map(async (draft) => {
                const trip = await this.prisma.trip.findFirst({
                    where: {
                        metadata: {
                            path: ['decisionDraftId'],
                            equals: draft.draftId,
                        },
                    },
                    select: { id: true },
                });
                const mappedDraft = this.mapToDecisionDraft(draft, draft.decisionSteps);
                return {
                    ...mappedDraft,
                    trip_id: trip === null || trip === void 0 ? void 0 : trip.id,
                };
            }));
            return { items, total };
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] [Admin] 分页获取失败: ${error.message}`, error.stack);
            return { items: [], total: 0 };
        }
    }
    async getQualityStats(options) {
        this.logger.log(`[DecisionDraftStorage] [Admin] 获取质量统计: timeRange=${options.timeRange}`);
        try {
            const now = new Date();
            let startDate;
            switch (options.timeRange) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startDate = new Date(0);
            }
            const drafts = await this.prisma.decisionDraft.findMany({
                where: {
                    createdAt: { gte: startDate },
                },
                include: {
                    decisionSteps: true,
                },
            });
            const totalDecisions = drafts.length;
            const totalSteps = drafts.reduce((sum, d) => { var _a; return sum + (((_a = d.decisionSteps) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
            const avgStepsPerDraft = totalDecisions > 0 ? totalSteps / totalDecisions : 0;
            const typeStats = new Map();
            drafts.forEach((draft) => {
                var _a;
                (_a = draft.decisionSteps) === null || _a === void 0 ? void 0 : _a.forEach((step) => {
                    const type = step.decisionType || 'unknown';
                    const stat = typeStats.get(type) || { count: 0, success: 0 };
                    stat.count++;
                    if (step.status === 'completed') {
                        stat.success++;
                    }
                    typeStats.set(type, stat);
                });
            });
            const decisionTypes = Array.from(typeStats.entries()).map(([type, stat]) => ({
                type,
                count: stat.count,
                success_rate: stat.count > 0 ? (stat.success / stat.count) * 100 : 0,
            }));
            const trendMap = new Map();
            drafts.forEach((draft) => {
                var _a, _b;
                const date = draft.createdAt.toISOString().split('T')[0];
                const trend = trendMap.get(date) || { total: 0, success: 0, failed: 0 };
                trend.total++;
                const allCompleted = (_a = draft.decisionSteps) === null || _a === void 0 ? void 0 : _a.every((s) => s.status === 'completed');
                if (allCompleted && ((_b = draft.decisionSteps) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                    trend.success++;
                }
                else {
                    trend.failed++;
                }
                trendMap.set(date, trend);
            });
            const trends = Array.from(trendMap.entries())
                .map(([date, data]) => ({ date, ...data }))
                .sort((a, b) => a.date.localeCompare(b.date));
            const successCount = trends.reduce((sum, t) => sum + t.success, 0);
            const successRate = totalDecisions > 0 ? (successCount / totalDecisions) * 100 : 0;
            return {
                total_decisions: totalDecisions,
                success_rate: Math.round(successRate * 100) / 100,
                avg_decision_time_ms: 2500,
                avg_steps_per_draft: Math.round(avgStepsPerDraft * 100) / 100,
                user_acceptance_rate: 85,
                user_modification_rate: 10,
                user_rejection_rate: 5,
                avg_user_rating: 4.2,
                decision_types: decisionTypes,
                trends,
                top_issues: [
                    { issue: '数据源超时', count: 3, percentage: 15 },
                    { issue: '约束冲突', count: 2, percentage: 10 },
                ],
            };
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] [Admin] 获取质量统计失败: ${error.message}`, error.stack);
            return {
                total_decisions: 0,
                success_rate: 0,
                avg_decision_time_ms: 0,
                avg_steps_per_draft: 0,
                user_acceptance_rate: 0,
                user_modification_rate: 0,
                user_rejection_rate: 0,
                avg_user_rating: 0,
                decision_types: [],
                trends: [],
                top_issues: [],
            };
        }
    }
    async getUserStylesSummary(options) {
        this.logger.log(`[DecisionDraftStorage] [Admin] 获取用户风格汇总: page=${options.page}`);
        try {
            const userStats = await this.prisma.decisionDraft.groupBy({
                by: ['createdBy'],
                _count: { id: true },
                _max: { createdAt: true },
            });
            const totalUsers = userStats.length;
            let adventurous = 0;
            let cautious = 0;
            let balanced = 0;
            userStats.forEach((stat) => {
                const count = stat._count.id;
                if (count > 10) {
                    adventurous++;
                }
                else if (count < 3) {
                    cautious++;
                }
                else {
                    balanced++;
                }
            });
            const styleDistribution = [
                { style: 'adventurous', count: adventurous, percentage: totalUsers > 0 ? (adventurous / totalUsers) * 100 : 0 },
                { style: 'cautious', count: cautious, percentage: totalUsers > 0 ? (cautious / totalUsers) * 100 : 0 },
                { style: 'balanced', count: balanced, percentage: totalUsers > 0 ? (balanced / totalUsers) * 100 : 0 },
            ];
            const paginatedStats = userStats
                .slice((options.page - 1) * options.pageSize, options.page * options.pageSize);
            const users = paginatedStats.map((stat) => {
                var _a;
                const count = stat._count.id;
                let styleType = 'balanced';
                if (count > 10)
                    styleType = 'adventurous';
                else if (count < 3)
                    styleType = 'cautious';
                return {
                    user_id: stat.createdBy || 'anonymous',
                    style_type: styleType,
                    decision_count: count,
                    acceptance_rate: 80 + Math.random() * 15,
                    avg_modification_count: Math.floor(Math.random() * 3),
                    top_preferences: ['自然风光', '冒险活动', '当地美食'].slice(0, Math.floor(Math.random() * 3) + 1),
                    last_active: ((_a = stat._max.createdAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || new Date().toISOString(),
                };
            });
            const behaviorPatterns = [
                {
                    pattern: 'detail_explorer',
                    description: '倾向于查看每个决策的详细信息',
                    user_count: Math.floor(totalUsers * 0.3),
                    examples: ['查看所有备选方案', '展开风险详情'],
                },
                {
                    pattern: 'quick_decider',
                    description: '快速接受推荐，较少修改',
                    user_count: Math.floor(totalUsers * 0.4),
                    examples: ['直接确认推荐', '很少使用 What-If'],
                },
                {
                    pattern: 'careful_planner',
                    description: '仔细比较选项，多次修改',
                    user_count: Math.floor(totalUsers * 0.3),
                    examples: ['使用 What-If 模拟', '多次调整偏好'],
                },
            ];
            return {
                total_users: totalUsers,
                style_distribution: styleDistribution,
                avg_confidence: 0.78,
                users,
                behavior_patterns: behaviorPatterns,
            };
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] [Admin] 获取用户风格汇总失败: ${error.message}`, error.stack);
            return {
                total_users: 0,
                style_distribution: [],
                avg_confidence: 0,
                users: [],
                behavior_patterns: [],
            };
        }
    }
    async getAnomalies(options) {
        this.logger.log(`[DecisionDraftStorage] [Admin] 获取异常监控: timeRange=${options.timeRange}, limit=${options.limit}`);
        try {
            const now = new Date();
            let startDate;
            switch (options.timeRange) {
                case 'hour':
                    startDate = new Date(now.getTime() - 60 * 60 * 1000);
                    break;
                case 'day':
                    startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            }
            const failedSteps = await this.prisma.decisionStep.findMany({
                where: {
                    status: { in: ['failed', 'error'] },
                    createdAt: { gte: startDate },
                },
                include: {
                    decisionDraft: {
                        select: { draftId: true, createdBy: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: options.limit,
            });
            const anomalies = failedSteps.map((step, index) => {
                var _a, _b;
                return ({
                    id: `anomaly-${step.id}-${index}`,
                    severity: 'error',
                    type: 'decision_step_failed',
                    message: `决策步骤 "${step.title}" 执行失败`,
                    draft_id: (_a = step.decisionDraft) === null || _a === void 0 ? void 0 : _a.draftId,
                    user_id: ((_b = step.decisionDraft) === null || _b === void 0 ? void 0 : _b.createdBy) || undefined,
                    timestamp: step.createdAt.toISOString(),
                    context: {
                        step_type: step.decisionType,
                        step_id: step.stepId,
                    },
                    resolved: false,
                });
            });
            const errors = anomalies.filter((a) => a.severity === 'error').length;
            const warnings = anomalies.filter((a) => a.severity === 'warning').length;
            const infos = anomalies.filter((a) => a.severity === 'info').length;
            const typeCount = new Map();
            anomalies.forEach((a) => {
                typeCount.set(a.type, (typeCount.get(a.type) || 0) + 1);
            });
            const trendingIssues = Array.from(typeCount.entries()).map(([type, count]) => ({
                type,
                count,
                trend: (count > 5 ? 'increasing' : count > 2 ? 'stable' : 'decreasing'),
            }));
            return {
                total: anomalies.length,
                errors,
                warnings,
                infos,
                anomalies,
                trending_issues: trendingIssues,
            };
        }
        catch (error) {
            this.logger.error(`[DecisionDraftStorage] [Admin] 获取异常监控失败: ${error.message}`, error.stack);
            return {
                total: 0,
                errors: 0,
                warnings: 0,
                infos: 0,
                anomalies: [],
                trending_issues: [],
            };
        }
    }
};
exports.DecisionDraftStorageService = DecisionDraftStorageService;
exports.DecisionDraftStorageService = DecisionDraftStorageService = DecisionDraftStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DecisionDraftStorageService);
//# sourceMappingURL=decision-draft-storage.service.js.map