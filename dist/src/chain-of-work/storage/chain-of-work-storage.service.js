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
var ChainOfWorkStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainOfWorkStorageService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ChainOfWorkStorageService = ChainOfWorkStorageService_1 = class ChainOfWorkStorageService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ChainOfWorkStorageService_1.name);
    }
    async getStats(query) {
        this.logger.log(`[ChainOfWorkStorage] 获取统计信息`);
        const dateFilter = {};
        if (query.startDate) {
            dateFilter.gte = new Date(query.startDate);
        }
        if (query.endDate) {
            dateFilter.lte = new Date(query.endDate);
        }
        const whereClause = {};
        if (Object.keys(dateFilter).length > 0) {
            whereClause.createdAt = dateFilter;
        }
        const totalDrafts = await this.prisma.decisionDraft.count({ where: whereClause });
        const totalExecutions = await this.prisma.decisionDraft.count({
            where: {
                ...whereClause,
                executionResultData: { not: null },
            },
        });
        const successfulExecutions = await this.prisma.decisionDraft.count({
            where: {
                ...whereClause,
                executionResultData: {
                    path: ['success'],
                    equals: true,
                },
            },
        });
        const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;
        const drafts = await this.prisma.decisionDraft.findMany({
            where: whereClause,
            select: {
                userMode: true,
                stepCount: true,
                decisionSteps: {
                    select: {
                        decisionType: true,
                        status: true,
                        confidence: true,
                    },
                },
            },
        });
        const draftsByStatus = {};
        const draftsByStepType = {};
        const skillUsage = {};
        const subAgentUsage = {};
        for (const draft of drafts) {
            const mode = draft.userMode || 'toc';
            draftsByStatus[mode] = (draftsByStatus[mode] || 0) + 1;
            for (const step of draft.decisionSteps) {
                const stepType = step.decisionType || 'unknown';
                draftsByStepType[stepType] = (draftsByStepType[stepType] || 0) + 1;
                const status = step.status || 'pending';
                draftsByStatus[status] = (draftsByStatus[status] || 0) + 1;
            }
        }
        const steps = await this.prisma.decisionStep.findMany({
            where: whereClause.createdAt ? { createdAt: whereClause.createdAt } : {},
            select: {
                evidence: true,
                confidence: true,
                decisionType: true,
                stepId: true,
            },
            take: 1000,
        });
        for (const step of steps) {
            const evidence = step.evidence;
            if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
                if (evidence.skill_name) {
                    if (!skillUsage[evidence.skill_name]) {
                        skillUsage[evidence.skill_name] = { count: 0, totalConfidence: 0 };
                    }
                    skillUsage[evidence.skill_name].count++;
                    skillUsage[evidence.skill_name].totalConfidence += step.confidence || 0.7;
                }
                if (evidence.sub_agent) {
                    subAgentUsage[evidence.sub_agent] = (subAgentUsage[evidence.sub_agent] || 0) + 1;
                }
            }
            if (Array.isArray(evidence)) {
                for (const e of evidence) {
                    if (e.skill_name) {
                        if (!skillUsage[e.skill_name]) {
                            skillUsage[e.skill_name] = { count: 0, totalConfidence: 0 };
                        }
                        skillUsage[e.skill_name].count++;
                        skillUsage[e.skill_name].totalConfidence += step.confidence || 0.7;
                    }
                    if (e.sub_agent) {
                        subAgentUsage[e.sub_agent] = (subAgentUsage[e.sub_agent] || 0) + 1;
                    }
                }
            }
            if (!(evidence === null || evidence === void 0 ? void 0 : evidence.sub_agent)) {
                const agentMapping = {
                    'transport-decision': 'GeoAgent',
                    'pace-decision': 'GeoAgent',
                    'weather-decision': 'WeatherAgent',
                    'cost-decision': 'CostAgent',
                    'experience-decision': 'ExperienceAgent',
                };
                const agent = agentMapping[step.decisionType] || 'CoreDecision';
                subAgentUsage[agent] = (subAgentUsage[agent] || 0) + 1;
            }
            if (!(evidence === null || evidence === void 0 ? void 0 : evidence.skill_name)) {
                const inferredSkill = this.inferSkillName(step.stepId);
                if (inferredSkill) {
                    if (!skillUsage[inferredSkill]) {
                        skillUsage[inferredSkill] = { count: 0, totalConfidence: 0 };
                    }
                    skillUsage[inferredSkill].count++;
                    skillUsage[inferredSkill].totalConfidence += step.confidence || 0.7;
                }
            }
        }
        const topSkills = Object.entries(skillUsage)
            .map(([name, data]) => ({
            skill_name: name,
            usage_count: data.count,
            avg_confidence: data.count > 0 ? data.totalConfidence / data.count : 0,
        }))
            .sort((a, b) => b.usage_count - a.usage_count)
            .slice(0, 10);
        const topSubAgents = Object.entries(subAgentUsage)
            .map(([name, count]) => ({ sub_agent: name, usage_count: count }))
            .sort((a, b) => b.usage_count - a.usage_count)
            .slice(0, 10);
        return {
            total_drafts: totalDrafts,
            total_executions: totalExecutions,
            success_rate: Math.round(successRate * 100) / 100,
            avg_generation_time_ms: 1500,
            avg_execution_time_ms: 3000,
            drafts_by_status: draftsByStatus,
            drafts_by_step_type: draftsByStepType,
            top_skills: topSkills,
            top_sub_agents: topSubAgents,
        };
    }
    async getDraftList(query) {
        this.logger.log(`[ChainOfWorkStorage] 获取草案列表`);
        const page = query.page || 1;
        const pageSize = query.pageSize || 20;
        const skip = (page - 1) * pageSize;
        const whereClause = {};
        if (query.workflowId) {
            whereClause.workflowId = query.workflowId;
        }
        if (query.userId) {
            whereClause.createdBy = query.userId;
        }
        if (query.status) {
            whereClause.userMode = query.status;
        }
        if (query.startDate || query.endDate) {
            whereClause.createdAt = {};
            if (query.startDate) {
                whereClause.createdAt.gte = new Date(query.startDate);
            }
            if (query.endDate) {
                whereClause.createdAt.lte = new Date(query.endDate);
            }
        }
        if (query.search) {
            whereClause.OR = [
                { draftId: { contains: query.search, mode: 'insensitive' } },
                { workflowId: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        const [total, drafts] = await Promise.all([
            this.prisma.decisionDraft.count({ where: whereClause }),
            this.prisma.decisionDraft.findMany({
                where: whereClause,
                skip,
                take: pageSize,
                orderBy: { createdAt: 'desc' },
                select: {
                    draftId: true,
                    workflowId: true,
                    version: true,
                    stepCount: true,
                    userMode: true,
                    createdBy: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
        ]);
        const draftItems = drafts.map(d => ({
            draft_id: d.draftId,
            workflow_id: d.workflowId,
            user_id: d.createdBy,
            version: d.version,
            step_count: d.stepCount,
            status: d.userMode || 'toc',
            created_at: d.createdAt.toISOString(),
            updated_at: d.updatedAt.toISOString(),
        }));
        return {
            drafts: draftItems,
            pagination: {
                page,
                page_size: pageSize,
                total,
                total_pages: Math.ceil(total / pageSize),
            },
        };
    }
    async getDraftDetail(draftId) {
        this.logger.log(`[ChainOfWorkStorage] 获取草案详情: ${draftId}`);
        const decisionDraft = await this.prisma.decisionDraft.findFirst({
            where: {
                OR: [
                    { draftId: draftId },
                    { workflowId: draftId },
                ],
            },
            include: {
                decisionSteps: true,
            },
        });
        if (!decisionDraft) {
            return { draft: null };
        }
        const stepDraftData = decisionDraft.stepDraftData;
        const draft = {
            draft_id: decisionDraft.draftId,
            workflow_id: decisionDraft.workflowId,
            version: decisionDraft.version,
            orchestration_mode: 'CLAUDE_SM',
            steps: (stepDraftData === null || stepDraftData === void 0 ? void 0 : stepDraftData.steps) || decisionDraft.decisionSteps.map(step => ({
                id: step.stepId,
                step_type: this.mapDecisionTypeToStepType(step.decisionType),
                title: step.title,
                description: step.description || '',
                status: step.status,
                confidence: step.confidence,
                inputs: step.inputs,
                outputs: step.outputs,
                evidence: step.evidence,
            })),
            metadata: {
                step_count: decisionDraft.stepCount,
                skills_count: 0,
                sub_agents_count: 0,
                last_modified: decisionDraft.updatedAt.toISOString(),
                created_by: decisionDraft.createdBy,
            },
            created_at: decisionDraft.createdAt.toISOString(),
            updated_at: decisionDraft.updatedAt.toISOString(),
        };
        const versions = await this.prisma.decisionDraftVersion.findMany({
            where: { workflowId: decisionDraft.workflowId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                versionId: true,
                version: true,
                createdAt: true,
                executionResultData: true,
            },
        });
        const executionHistory = versions
            .filter(v => v.executionResultData)
            .map(v => {
            const result = v.executionResultData;
            return {
                execution_id: v.versionId,
                status: (result === null || result === void 0 ? void 0 : result.success) ? 'completed' : 'failed',
                executed_at: v.createdAt.toISOString(),
            };
        });
        return {
            draft,
            user: {
                id: decisionDraft.createdBy,
                email: `${decisionDraft.createdBy}@tripnara.com`,
            },
            execution_history: executionHistory,
        };
    }
    async batchOperation(action, draftIds, params) {
        this.logger.log(`[ChainOfWorkStorage] 批量操作: action=${action}, count=${draftIds.length}`);
        const results = [];
        let successCount = 0;
        let failedCount = 0;
        for (const draftId of draftIds) {
            try {
                switch (action) {
                    case 'delete':
                        await this.prisma.decisionDraft.deleteMany({
                            where: { draftId },
                        });
                        results.push({ draft_id: draftId, success: true });
                        successCount++;
                        break;
                    case 'export':
                        const draft = await this.prisma.decisionDraft.findFirst({
                            where: { draftId },
                            include: { decisionSteps: true },
                        });
                        results.push({
                            draft_id: draftId,
                            success: !!draft,
                            error: draft ? undefined : '草案不存在',
                        });
                        if (draft)
                            successCount++;
                        else
                            failedCount++;
                        break;
                    case 'validate':
                        const toValidate = await this.prisma.decisionDraft.findFirst({
                            where: { draftId },
                            include: { decisionSteps: true },
                        });
                        if (toValidate && toValidate.decisionSteps.length > 0) {
                            results.push({ draft_id: draftId, success: true });
                            successCount++;
                        }
                        else {
                            results.push({
                                draft_id: draftId,
                                success: false,
                                error: toValidate ? '草案缺少步骤' : '草案不存在',
                            });
                            failedCount++;
                        }
                        break;
                    case 'archive':
                        await this.prisma.decisionDraft.updateMany({
                            where: { draftId },
                            data: { userMode: 'archived' },
                        });
                        results.push({ draft_id: draftId, success: true });
                        successCount++;
                        break;
                    default:
                        results.push({ draft_id: draftId, success: false, error: `不支持的操作: ${action}` });
                        failedCount++;
                }
            }
            catch (error) {
                results.push({ draft_id: draftId, success: false, error: error.message });
                failedCount++;
            }
        }
        return {
            success_count: successCount,
            failed_count: failedCount,
            results,
        };
    }
    async getExecutionHistory(query) {
        this.logger.log(`[ChainOfWorkStorage] 获取执行历史`);
        const page = query.page || 1;
        const pageSize = query.pageSize || 20;
        const skip = (page - 1) * pageSize;
        const whereClause = {
            executionResultData: { not: null },
        };
        if (query.draftId) {
            whereClause.draftId = query.draftId;
        }
        if (query.startDate || query.endDate) {
            whereClause.createdAt = {};
            if (query.startDate) {
                whereClause.createdAt.gte = new Date(query.startDate);
            }
            if (query.endDate) {
                whereClause.createdAt.lte = new Date(query.endDate);
            }
        }
        const [total, drafts] = await Promise.all([
            this.prisma.decisionDraft.count({ where: whereClause }),
            this.prisma.decisionDraft.findMany({
                where: whereClause,
                skip,
                take: pageSize,
                orderBy: { updatedAt: 'desc' },
                select: {
                    draftId: true,
                    executionResultId: true,
                    executionResultData: true,
                    createdBy: true,
                    updatedAt: true,
                },
            }),
        ]);
        const executions = drafts.map(d => {
            const result = d.executionResultData;
            return {
                execution_id: d.executionResultId || `exec-${d.draftId}`,
                draft_id: d.draftId,
                user_id: d.createdBy,
                status: (result === null || result === void 0 ? void 0 : result.success) ? 'completed' : 'failed',
                duration_ms: (result === null || result === void 0 ? void 0 : result.duration_ms) || 0,
                executed_at: d.updatedAt.toISOString(),
            };
        });
        const filteredExecutions = query.status
            ? executions.filter(e => e.status === query.status)
            : executions;
        return {
            executions: filteredExecutions,
            pagination: {
                page,
                page_size: pageSize,
                total,
                total_pages: Math.ceil(total / pageSize),
            },
        };
    }
    async getExecutionDetail(executionId) {
        this.logger.log(`[ChainOfWorkStorage] 获取执行详情: ${executionId}`);
        const draft = await this.prisma.decisionDraft.findFirst({
            where: {
                OR: [
                    { executionResultId: executionId },
                    { draftId: executionId },
                ],
            },
            include: { decisionSteps: true },
        });
        if (!draft || !draft.executionResultData) {
            const version = await this.prisma.decisionDraftVersion.findFirst({
                where: { versionId: executionId },
            });
            if (!version || !version.executionResultData) {
                return { execution: null };
            }
            const result = version.executionResultData;
            return {
                execution: {
                    execution_id: version.versionId,
                    draft_id: version.workflowId,
                    status: (result === null || result === void 0 ? void 0 : result.success) ? 'completed' : 'failed',
                    result: result,
                    trace: {
                        total_duration_ms: (result === null || result === void 0 ? void 0 : result.duration_ms) || 0,
                        steps_executed: (result === null || result === void 0 ? void 0 : result.steps_executed) || 0,
                        llm_calls: (result === null || result === void 0 ? void 0 : result.llm_calls) || 0,
                        skills_called: (result === null || result === void 0 ? void 0 : result.skills_called) || 0,
                        errors: (result === null || result === void 0 ? void 0 : result.errors) || [],
                    },
                    executed_at: version.createdAt.toISOString(),
                },
            };
        }
        const result = draft.executionResultData;
        return {
            execution: {
                execution_id: draft.executionResultId || executionId,
                draft_id: draft.draftId,
                user_id: draft.createdBy,
                status: (result === null || result === void 0 ? void 0 : result.success) ? 'completed' : 'failed',
                result: result,
                trace: {
                    total_duration_ms: (result === null || result === void 0 ? void 0 : result.duration_ms) || 0,
                    steps_executed: draft.decisionSteps.length,
                    llm_calls: (result === null || result === void 0 ? void 0 : result.llm_calls) || 0,
                    skills_called: (result === null || result === void 0 ? void 0 : result.skills_called) || 0,
                    errors: (result === null || result === void 0 ? void 0 : result.errors) || [],
                },
                executed_at: draft.updatedAt.toISOString(),
            },
        };
    }
    async saveExecutionResult(draftId, executionResult) {
        this.logger.log(`[ChainOfWorkStorage] 保存执行结果: ${draftId}`);
        const draft = await this.prisma.decisionDraft.findFirst({
            where: {
                OR: [{ draftId }, { workflowId: draftId }],
            },
        });
        if (!draft) {
            throw new Error(`草案不存在: ${draftId}`);
        }
        await this.prisma.decisionDraft.update({
            where: { id: draft.id },
            data: {
                executionResultId: executionResult.execution_id,
                executionResultData: executionResult,
                updatedAt: new Date(),
            },
        });
        if (executionResult.steps && Array.isArray(executionResult.steps)) {
            for (const stepResult of executionResult.steps) {
                await this.prisma.decisionStep.updateMany({
                    where: {
                        decisionDraftId: draft.id,
                        stepId: stepResult.step_id,
                    },
                    data: {
                        status: stepResult.status === 'completed' ? 'approved' :
                            stepResult.status === 'failed' ? 'rejected' : 'pending',
                        evidence: {
                            execution_id: executionResult.execution_id,
                            executed_at: new Date().toISOString(),
                            duration_ms: stepResult.duration_ms,
                            status: stepResult.status,
                            output: stepResult.output,
                            error: stepResult.error,
                            skill_name: stepResult.skill_name || this.inferSkillName(stepResult.step_id),
                            sub_agent: stepResult.sub_agent || this.inferSubAgent(stepResult.step_id),
                        },
                        updatedAt: new Date(),
                    },
                });
            }
        }
        this.logger.log(`[ChainOfWorkStorage] 执行结果保存完成`);
    }
    inferSkillName(stepId) {
        const skillMapping = {
            'step-research': '信息收集',
            'step-weather': '天气预报查询',
            'step-route': '路线规划',
            'step-poi': 'POI搜索',
            'step-hotel': '酒店预定查询',
            'step-cost': '费用估算',
        };
        for (const [key, skill] of Object.entries(skillMapping)) {
            if (stepId.toLowerCase().includes(key.replace('step-', ''))) {
                return skill;
            }
        }
        return undefined;
    }
    inferSubAgent(stepId) {
        const agentMapping = {
            'intake': 'Planner',
            'gate': 'Gatekeeper',
            'research': 'LocalInsight',
            'plan': 'Planner',
            'verify': 'Compliance',
            'repair': 'Execution',
            'narrate': 'Narrator',
        };
        for (const [key, agent] of Object.entries(agentMapping)) {
            if (stepId.toLowerCase().includes(key)) {
                return agent;
            }
        }
        return 'CoreDecision';
    }
    mapDecisionTypeToStepType(decisionType) {
        const mapping = {
            'transport-decision': 'RESEARCH',
            'pace-decision': 'PLAN_GEN',
            'weather-decision': 'RESEARCH',
            'cost-decision': 'RESEARCH',
            'experience-decision': 'RESEARCH',
            'intake': 'INTAKE',
            'gate-eval': 'GATE_EVAL',
            'plan-gen': 'PLAN_GEN',
            'verify': 'VERIFY',
            'repair': 'REPAIR',
            'narrate': 'NARRATE',
        };
        return mapping[decisionType] || 'RESEARCH';
    }
};
exports.ChainOfWorkStorageService = ChainOfWorkStorageService;
exports.ChainOfWorkStorageService = ChainOfWorkStorageService = ChainOfWorkStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ChainOfWorkStorageService);
//# sourceMappingURL=chain-of-work-storage.service.js.map