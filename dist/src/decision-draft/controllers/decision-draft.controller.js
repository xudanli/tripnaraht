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
var DecisionDraftController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionDraftController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const decision_draft_generator_service_1 = require("../services/decision-draft-generator.service");
const decision_explanation_service_1 = require("../services/decision-explanation.service");
const decision_draft_version_service_1 = require("../services/decision-draft-version.service");
const decision_draft_storage_service_1 = require("../storage/decision-draft-storage.service");
const decision_draft_editor_service_1 = require("../services/decision-draft-editor.service");
const decision_draft_dto_1 = require("../dto/decision-draft.dto");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
const common_2 = require("@nestjs/common");
const current_user_decorator_1 = require("../../auth/decorators/current-user.decorator");
const studio_mode_guard_1 = require("../guards/studio-mode.guard");
let DecisionDraftController = DecisionDraftController_1 = class DecisionDraftController {
    constructor(decisionDraftGenerator, explanationService, versionService, storageService, editorService) {
        this.decisionDraftGenerator = decisionDraftGenerator;
        this.explanationService = explanationService;
        this.versionService = versionService;
        this.storageService = storageService;
        this.editorService = editorService;
        this.logger = new common_1.Logger(DecisionDraftController_1.name);
    }
    async getDecisionDraftByTripId(tripId) {
        this.logger.log(`[DecisionDraftController] 根据 tripId 获取决策草案: tripId=${tripId}`);
        const decisionDraft = await this.storageService.loadDecisionDraftByTripId(tripId);
        if (!decisionDraft) {
            throw new Error(`行程 ${tripId} 没有关联的决策草案。只有通过自然语言创建的行程才会生成决策草案。`);
        }
        const response = {
            draft_id: decisionDraft.draft_id,
            decision_steps: decisionDraft.decision_steps,
            user_mode: decisionDraft.user_mode,
            metadata: decisionDraft.metadata,
        };
        if (decisionDraft.user_mode === 'expert' || decisionDraft.user_mode === 'studio') {
            response.step_draft = decisionDraft.step_draft;
        }
        if (decisionDraft.user_mode === 'studio') {
            response.debug_info = decisionDraft.debug_info;
        }
        return response;
    }
    async getStats(workflowId) {
        this.logger.log(`[DecisionDraftController] 获取统计信息: workflow_id=${workflowId || 'all'}`);
        return {
            total_drafts: 0,
            avg_decision_count: 0,
            avg_generation_time_ms: 0,
        };
    }
    async adminListDecisionDrafts(page, pageSize, status, destination, startDate, endDate, sortBy, sortOrder) {
        this.logger.log(`[DecisionDraftController] [Admin] 获取决策草案列表: page=${page}, pageSize=${pageSize}`);
        const currentPage = Math.max(1, page || 1);
        const size = Math.min(100, Math.max(1, pageSize || 20));
        const result = await this.storageService.listDecisionDrafts({
            page: currentPage,
            pageSize: size,
            status,
            destination,
            startDate,
            endDate,
            sortBy: sortBy || 'created_at',
            sortOrder: sortOrder || 'desc',
        });
        return {
            items: result.items.map(draft => {
                var _a;
                const metadata = draft.metadata;
                return {
                    draft_id: draft.draft_id,
                    trip_id: draft.trip_id,
                    plan_id: draft.plan_id,
                    destination: metadata === null || metadata === void 0 ? void 0 : metadata.destination,
                    status: (metadata === null || metadata === void 0 ? void 0 : metadata.status) || 'draft',
                    step_count: ((_a = draft.decision_steps) === null || _a === void 0 ? void 0 : _a.length) || 0,
                    user_mode: draft.user_mode,
                    created_at: (metadata === null || metadata === void 0 ? void 0 : metadata.created_at) || new Date().toISOString(),
                    updated_at: metadata === null || metadata === void 0 ? void 0 : metadata.updated_at,
                };
            }),
            pagination: {
                page: currentPage,
                pageSize: size,
                total: result.total,
                totalPages: Math.ceil(result.total / size),
            },
            filters: {
                status,
                destination,
                dateRange: startDate || endDate ? { start: startDate || '', end: endDate || '' } : undefined,
            },
        };
    }
    async adminGetQualityStats(timeRange, destination) {
        this.logger.log(`[DecisionDraftController] [Admin] 获取决策质量统计: timeRange=${timeRange}, destination=${destination}`);
        const stats = await this.storageService.getQualityStats({
            timeRange: timeRange || 'week',
            destination,
        });
        return {
            overview: {
                total_decisions: stats.total_decisions || 0,
                success_rate: stats.success_rate || 0,
                avg_decision_time_ms: stats.avg_decision_time_ms || 0,
                avg_steps_per_draft: stats.avg_steps_per_draft || 0,
            },
            quality_metrics: {
                user_acceptance_rate: stats.user_acceptance_rate || 0,
                user_modification_rate: stats.user_modification_rate || 0,
                user_rejection_rate: stats.user_rejection_rate || 0,
                avg_user_rating: stats.avg_user_rating || 0,
            },
            decision_types: stats.decision_types || [],
            trends: {
                period: timeRange || 'week',
                data: stats.trends || [],
            },
            top_issues: stats.top_issues || [],
        };
    }
    async adminGetUserStyles(page, pageSize, styleType) {
        this.logger.log(`[DecisionDraftController] [Admin] 获取用户决策风格汇总: page=${page}, styleType=${styleType}`);
        const currentPage = Math.max(1, page || 1);
        const size = Math.min(100, Math.max(1, pageSize || 20));
        const result = await this.storageService.getUserStylesSummary({
            page: currentPage,
            pageSize: size,
            styleType,
        });
        return {
            summary: {
                total_users_analyzed: result.total_users || 0,
                style_distribution: result.style_distribution || [
                    { style: 'adventurous', count: 0, percentage: 0 },
                    { style: 'cautious', count: 0, percentage: 0 },
                    { style: 'balanced', count: 0, percentage: 0 },
                ],
                avg_decision_confidence: result.avg_confidence || 0,
            },
            users: result.users || [],
            pagination: {
                page: currentPage,
                pageSize: size,
                total: result.total_users || 0,
                totalPages: Math.ceil((result.total_users || 0) / size),
            },
            behavior_patterns: result.behavior_patterns || [],
        };
    }
    async adminGetAnomalies(severity, timeRange, limit) {
        this.logger.log(`[DecisionDraftController] [Admin] 获取决策异常监控: severity=${severity}, timeRange=${timeRange}`);
        const maxLimit = Math.min(200, Math.max(1, limit || 50));
        const result = await this.storageService.getAnomalies({
            severity,
            timeRange: timeRange || 'day',
            limit: maxLimit,
        });
        return {
            summary: {
                total_anomalies: result.total || 0,
                errors: result.errors || 0,
                warnings: result.warnings || 0,
                infos: result.infos || 0,
            },
            anomalies: result.anomalies || [],
            trending_issues: result.trending_issues || [],
        };
    }
    async getDecisionDraft(draftId) {
        this.logger.log(`[DecisionDraftController] 获取决策草案: draft_id=${draftId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const response = {
            draft_id: decisionDraft.draft_id,
            decision_steps: decisionDraft.decision_steps,
            user_mode: decisionDraft.user_mode,
            metadata: decisionDraft.metadata,
        };
        if (decisionDraft.user_mode === 'expert' || decisionDraft.user_mode === 'studio') {
            response.step_draft = decisionDraft.step_draft;
        }
        if (decisionDraft.user_mode === 'studio') {
            response.debug_info = decisionDraft.debug_info;
        }
        return response;
    }
    async getExplanation(draftId, query, user) {
        this.logger.log(`[DecisionDraftController] 获取决策解释: draft_id=${draftId}, mode=${query.mode || 'toc'}`);
        const mode = query.mode || 'toc';
        if (mode === 'studio') {
            if (!user) {
                throw new common_2.ForbiddenException('需要认证才能访问 Studio 模式');
            }
            const userRoles = user.roles || [];
            const hasStudioPermission = userRoles.includes('studio') ||
                userRoles.includes('admin') ||
                userRoles.includes('ops');
            if (!hasStudioPermission) {
                throw new common_2.ForbiddenException('需要 Studio 权限才能访问 Studio 模式');
            }
        }
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        return this.explanationService.generateExplanation(decisionDraft, mode);
    }
    async getStepExplanation(draftId, stepId) {
        this.logger.log(`[DecisionDraftController] 获取决策步骤解释: draft_id=${draftId}, step_id=${stepId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        return this.explanationService.generateStepExplanation(decisionDraft, stepId);
    }
    async getVersions(draftId) {
        this.logger.log(`[DecisionDraftController] 获取版本列表: draft_id=${draftId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
        const versions = await this.versionService.getVersions(workflowId);
        return {
            versions: versions.map((v) => ({
                version_id: v.version_id,
                version: v.version || 'v1.0',
                created_by: v.created_by,
                description: v.description,
                created_at: v.created_at,
            })),
        };
    }
    async getVersion(draftId, versionId) {
        this.logger.log(`[DecisionDraftController] 获取版本详情: draft_id=${draftId}, version_id=${versionId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
        const version = await this.versionService.getVersion(workflowId, versionId);
        if (!version) {
            throw new Error(`版本不存在: ${versionId}`);
        }
        const response = {
            version_id: version.version_id,
            version: version.version || 'v1.0',
            decision_draft: {
                ...version.decision_draft,
            },
            created_by: version.created_by,
            description: version.description,
            created_at: version.created_at,
        };
        if (decisionDraft.user_mode === 'expert' || decisionDraft.user_mode === 'studio') {
            response.decision_draft.step_draft = version.step_draft;
        }
        if (decisionDraft.user_mode === 'studio' && version.decision_draft.debug_info) {
            response.decision_draft.debug_info = version.decision_draft.debug_info;
        }
        return response;
    }
    async compareVersions(draftId, versionId1, versionId2) {
        this.logger.log(`[DecisionDraftController] 对比版本: draft_id=${draftId}, version1=${versionId1}, version2=${versionId2}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
        return this.versionService.compareVersions(workflowId, versionId1, versionId2);
    }
    async editDecisionStep(draftId, stepId, dto) {
        this.logger.log(`[DecisionDraftController] 编辑决策步骤: draft_id=${draftId}, step_id=${stepId}`);
        if (!dto.operation) {
            throw new Error('缺少 operation 字段');
        }
        if (!dto.operation.action) {
            throw new Error(`缺少 action 字段，收到: ${JSON.stringify(dto)}`);
        }
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const updatedDraft = await this.editorService.editDecisionStep(decisionDraft, {
            ...dto.operation,
            decision_step_id: stepId,
        });
        const savedDraft = await this.storageService.saveDecisionDraft(updatedDraft);
        return { draft: savedDraft };
    }
    async applyDecisionDraft(draftId) {
        this.logger.log(`[DecisionDraftController] 应用决策草案: draft_id=${draftId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const applyResult = await this.editorService.applyDecisionDraft(decisionDraft);
        const savedDraft = await this.storageService.saveDecisionDraft(decisionDraft);
        return {
            draft: savedDraft,
            ...applyResult,
        };
    }
    async generateDecisionDraft(dto) {
        this.logger.log(`[DecisionDraftController] 生成决策草案: user_input=${dto.user_input.substring(0, 50)}...`);
        const startTime = Date.now();
        const draft = await this.decisionDraftGenerator.generateDecisionDraft(dto.user_input, dto.trip_plan_request, dto.config);
        const generationTime = Date.now() - startTime;
        const savedDraft = await this.storageService.saveDecisionDraft(draft);
        return {
            draft: savedDraft,
            generation_time_ms: generationTime,
        };
    }
    async batchEditDecisionSteps(draftId, dto) {
        this.logger.log(`[DecisionDraftController] 批量编辑决策步骤: draft_id=${draftId}, count=${dto.operations.length}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const updatedDraft = await this.editorService.batchEditDecisionSteps(decisionDraft, dto.operations);
        const savedDraft = await this.storageService.saveDecisionDraft(updatedDraft);
        return { draft: savedDraft };
    }
    async partialRegenerate(draftId, dto) {
        this.logger.log(`[DecisionDraftController] 局部重算: draft_id=${draftId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const startTime = Date.now();
        const updatedDraft = await this.editorService.partialRegenerate(decisionDraft, dto.config);
        const regenerationTime = Date.now() - startTime;
        const savedDraft = await this.storageService.saveDecisionDraft(updatedDraft);
        return {
            draft: savedDraft,
            regeneration_time_ms: regenerationTime,
        };
    }
    async reorderDecisionSteps(draftId, dto) {
        this.logger.log(`[DecisionDraftController] 重新排序决策步骤: draft_id=${draftId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const updatedDraft = await this.editorService.reorderDecisionSteps(decisionDraft, dto.new_order);
        const savedDraft = await this.storageService.saveDecisionDraft(updatedDraft);
        return { draft: savedDraft };
    }
    async saveVersion(draftId, dto) {
        this.logger.log(`[DecisionDraftController] 保存版本: draft_id=${draftId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const version = await this.versionService.saveVersion(decisionDraft, {
            creator: dto.creator,
            description: dto.description,
            tags: dto.tags,
        });
        return {
            version_id: version.version_id,
            version: version.version || 'v1.0',
            saved_at: version.created_at,
        };
    }
    async rollbackVersion(draftId, versionId) {
        this.logger.log(`[DecisionDraftController] 回滚版本: draft_id=${draftId}, version_id=${versionId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
        const version = await this.versionService.rollbackToVersion(workflowId, versionId);
        const savedDraft = await this.storageService.saveDecisionDraft(version.decision_draft);
        return { version: { ...version, decision_draft: savedDraft } };
    }
    async forkVersion(draftId, versionId, dto) {
        this.logger.log(`[DecisionDraftController] Fork 版本: draft_id=${draftId}, version_id=${versionId}, new_workflow_id=${dto.new_workflow_id}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
        const version = await this.versionService.forkVersion(workflowId, versionId, dto.new_workflow_id, {
            creator: dto.creator,
            description: dto.description,
        });
        const savedDraft = await this.storageService.saveDecisionDraft(version.decision_draft);
        return {
            version: { ...version, decision_draft: savedDraft },
            new_draft_id: savedDraft.draft_id,
        };
    }
    async getDebugInfo(draftId) {
        this.logger.log(`[DecisionDraftController] 获取调试信息: draft_id=${draftId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const debugInfo = decisionDraft.debug_info || {
            llm_calls: [],
            skill_calls: [],
            performance_metrics: undefined,
            execution_trace: undefined,
        };
        return {
            draft_id: decisionDraft.draft_id,
            debug_info: debugInfo,
        };
    }
    async previewImpact(draftId, body) {
        var _a, _b, _c, _d;
        this.logger.log(`[DecisionDraftController] 预览编辑影响: draft_id=${draftId}, step_id=${body.step_id}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const targetStep = (_a = decisionDraft.decision_steps) === null || _a === void 0 ? void 0 : _a.find((s) => s.id === body.step_id);
        if (!targetStep) {
            throw new Error(`决策步骤不存在: ${body.step_id}`);
        }
        const affectedSteps = [];
        const estimatedChanges = [];
        const warnings = [];
        if (body.proposed_changes.action === 'reject') {
            const stepIndex = (_b = decisionDraft.decision_steps) === null || _b === void 0 ? void 0 : _b.findIndex((s) => s.id === body.step_id);
            if (stepIndex !== undefined && stepIndex >= 0) {
                const subsequentSteps = ((_c = decisionDraft.decision_steps) === null || _c === void 0 ? void 0 : _c.slice(stepIndex + 1)) || [];
                for (const step of subsequentSteps) {
                    const stepAny = step;
                    if ((_d = stepAny.dependencies) === null || _d === void 0 ? void 0 : _d.includes(body.step_id)) {
                        affectedSteps.push(step.id);
                        estimatedChanges.push({
                            step_id: step.id,
                            change_type: 'regenerated',
                            description: `依赖被拒绝的步骤，需要重新生成`,
                        });
                    }
                }
            }
            warnings.push('拒绝此步骤可能导致后续依赖步骤需要重新生成');
        }
        else if (body.proposed_changes.action === 'modify') {
            estimatedChanges.push({
                step_id: body.step_id,
                change_type: 'modified',
                description: '步骤将按照您的修改进行更新',
            });
        }
        const riskLevel = affectedSteps.length > 3 ? 'high' :
            affectedSteps.length > 0 ? 'medium' : 'low';
        return {
            draft_id: draftId,
            step_id: body.step_id,
            impact: {
                affected_steps: affectedSteps,
                estimated_changes: estimatedChanges,
                risk_level: riskLevel,
                warnings,
            },
        };
    }
    async getReplayData(draftId) {
        this.logger.log(`[DecisionDraftController] 获取决策回放数据: draft_id=${draftId}`);
        const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
        if (!decisionDraft) {
            throw new Error(`决策草案不存在: ${draftId}`);
        }
        const timeline = (decisionDraft.decision_steps || []).map((step, index) => {
            var _a;
            return ({
                step_id: step.id || `step-${index}`,
                timestamp: ((_a = decisionDraft.metadata) === null || _a === void 0 ? void 0 : _a.created_at) || new Date().toISOString(),
                decision_type: step.type || 'unknown',
                summary: step.title || step.description || `步骤 ${index + 1}`,
                status: step.status || 'completed',
            });
        });
        const snapshots = (decisionDraft.decision_steps || []).map((step, index) => {
            var _a;
            return ({
                snapshot_id: `snapshot-${step.id || index}`,
                step_id: step.id || `step-${index}`,
                state: {
                    inputs: step.inputs || [],
                    outputs: step.outputs || [],
                    evidence: step.evidence || [],
                },
                created_at: ((_a = decisionDraft.metadata) === null || _a === void 0 ? void 0 : _a.created_at) || new Date().toISOString(),
            });
        });
        const nodes = (decisionDraft.decision_steps || []).map((step, index) => ({
            id: step.id || `step-${index}`,
            type: step.type || 'decision',
            label: step.title || `决策 ${index + 1}`,
            data: {
                status: step.status,
                confidence: step.confidence,
                description: step.description,
            },
        }));
        const edges = [];
        for (let i = 1; i < nodes.length; i++) {
            edges.push({
                source: nodes[i - 1].id,
                target: nodes[i].id,
                label: `→`,
            });
        }
        return {
            draft_id: decisionDraft.draft_id,
            timeline,
            snapshots,
            visualization: {
                nodes,
                edges,
            },
        };
    }
};
exports.DecisionDraftController = DecisionDraftController;
__decorate([
    (0, common_1.Get)('trip/:tripId'),
    (0, swagger_1.ApiOperation)({
        summary: '根据 tripId 获取决策草案',
        description: '通过 tripId 查询关联的决策草案（仅适用于自然语言创建的行程）',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '决策草案获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '决策草案不存在或行程不是自然语言创建' }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "getDecisionDraftByTripId", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取统计信息',
        description: '获取决策草案的统计信息（总数、平均决策数、平均生成时间等）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '统计信息获取成功' }),
    __param(0, (0, common_1.Query)('workflow_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('admin/list'),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 决策草案分页列表',
        description: '管理后台专用：获取所有决策草案，支持分页、筛选、排序',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: '页码，默认 1' }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number, description: '每页数量，默认 20，最大 100' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, type: String, description: '状态筛选: draft, completed, failed' }),
    (0, swagger_1.ApiQuery)({ name: 'destination', required: false, type: String, description: '目的地筛选' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, type: String, description: '创建时间起始（ISO格式）' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, type: String, description: '创建时间结束（ISO格式）' }),
    (0, swagger_1.ApiQuery)({ name: 'sortBy', required: false, type: String, description: '排序字段: created_at, updated_at, step_count' }),
    (0, swagger_1.ApiQuery)({ name: 'sortOrder', required: false, type: String, description: '排序方向: asc, desc' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '分页列表获取成功' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('destination')),
    __param(4, (0, common_1.Query)('startDate')),
    __param(5, (0, common_1.Query)('endDate')),
    __param(6, (0, common_1.Query)('sortBy')),
    __param(7, (0, common_1.Query)('sortOrder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "adminListDecisionDrafts", null);
__decorate([
    (0, common_1.Get)('admin/quality-stats'),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 全局决策质量统计',
        description: '管理后台专用：获取决策系统的全局质量指标，包括成功率、用户满意度、平均决策时间等',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiQuery)({ name: 'timeRange', required: false, type: String, description: '时间范围: today, week, month, all' }),
    (0, swagger_1.ApiQuery)({ name: 'destination', required: false, type: String, description: '目的地筛选' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '质量统计获取成功' }),
    __param(0, (0, common_1.Query)('timeRange')),
    __param(1, (0, common_1.Query)('destination')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "adminGetQualityStats", null);
__decorate([
    (0, common_1.Get)('admin/user-styles'),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 用户决策风格汇总',
        description: '管理后台专用：获取用户决策风格的汇总分析，包括偏好分布、行为模式等',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: '页码，默认 1' }),
    (0, swagger_1.ApiQuery)({ name: 'pageSize', required: false, type: Number, description: '每页数量，默认 20' }),
    (0, swagger_1.ApiQuery)({ name: 'styleType', required: false, type: String, description: '风格类型筛选: adventurous, cautious, balanced' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '用户风格汇总获取成功' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('pageSize')),
    __param(2, (0, common_1.Query)('styleType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "adminGetUserStyles", null);
__decorate([
    (0, common_1.Get)('admin/anomalies'),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 决策异常监控',
        description: '管理后台专用：获取决策过程中的异常、错误和警告信息',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiQuery)({ name: 'severity', required: false, type: String, description: '严重程度: error, warning, info' }),
    (0, swagger_1.ApiQuery)({ name: 'timeRange', required: false, type: String, description: '时间范围: hour, day, week' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: '返回数量，默认 50' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '异常监控数据获取成功' }),
    __param(0, (0, common_1.Query)('severity')),
    __param(1, (0, common_1.Query)('timeRange')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "adminGetAnomalies", null);
__decorate([
    (0, common_1.Get)(':draftId'),
    (0, swagger_1.ApiOperation)({
        summary: '获取决策草案',
        description: '根据用户模式返回决策草案（ToC 模式只显示业务层，Expert 模式显示完整双层结构）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '决策草案获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '决策草案不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "getDecisionDraft", null);
__decorate([
    (0, common_1.Get)(':draftId/explanation'),
    (0, swagger_1.ApiOperation)({
        summary: '获取决策解释',
        description: '根据模式返回决策解释（ToC 模式：轻解释，Expert 模式：完整解释，Studio 模式：完整技术解释，需要 Studio 权限）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiQuery)({ name: 'mode', enum: ['toc', 'expert', 'studio'], required: false, description: '解释模式' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '决策解释获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Studio 模式需要 Studio 权限' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '决策草案不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, decision_draft_dto_1.GetExplanationQueryDto, Object]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "getExplanation", null);
__decorate([
    (0, common_1.Get)(':draftId/step/:stepId/explanation'),
    (0, swagger_1.ApiOperation)({
        summary: '获取决策步骤解释',
        description: '获取单个决策步骤的详细解释（包括 Step Drafts、证据链、决策日志、三人格评审）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '决策步骤解释获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '决策草案或步骤不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Param)('stepId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "getStepExplanation", null);
__decorate([
    (0, common_1.Get)(':draftId/versions'),
    (0, swagger_1.ApiOperation)({
        summary: '获取版本列表',
        description: '获取决策草案的所有版本（只返回版本摘要，不返回完整数据）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '版本列表获取成功' }),
    __param(0, (0, common_1.Param)('draftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "getVersions", null);
__decorate([
    (0, common_1.Get)(':draftId/versions/:versionId'),
    (0, swagger_1.ApiOperation)({
        summary: '获取版本详情',
        description: '获取特定版本的决策草案（根据用户模式返回 ToC 或 Expert 视图）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '版本详情获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '版本不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Param)('versionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "getVersion", null);
__decorate([
    (0, common_1.Get)(':draftId/versions/:versionId1/compare/:versionId2'),
    (0, swagger_1.ApiOperation)({
        summary: '对比版本',
        description: '对比两个版本的差异（决策步骤差异、Step Drafts 差异）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '版本对比成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '版本不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Param)('versionId1')),
    __param(2, (0, common_1.Param)('versionId2')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "compareVersions", null);
__decorate([
    (0, common_1.Put)(':draftId/step/:stepId'),
    (0, swagger_1.ApiOperation)({
        summary: '编辑决策步骤',
        description: '编辑单个决策步骤（接受/拒绝/修改）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '决策步骤编辑成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '决策草案或步骤不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Param)('stepId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, decision_draft_dto_1.EditDecisionStepDto]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "editDecisionStep", null);
__decorate([
    (0, common_1.Post)(':draftId/apply'),
    (0, swagger_1.ApiOperation)({
        summary: '应用决策草案',
        description: '将已批准或修改的决策步骤应用到行程',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '决策草案应用成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '决策草案不存在' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '存在未批准的决策步骤' }),
    __param(0, (0, common_1.Param)('draftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "applyDecisionDraft", null);
__decorate([
    (0, common_1.Post)('generate'),
    (0, swagger_1.ApiOperation)({
        summary: '生成决策草案',
        description: '根据用户输入和旅行需求，生成决策草案（业务层 + 技术层）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '决策草案生成成功' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数错误' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [decision_draft_dto_1.GenerateDecisionDraftDto]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "generateDecisionDraft", null);
__decorate([
    (0, common_1.Put)(':draftId/steps/batch'),
    (0, swagger_1.ApiOperation)({
        summary: '批量编辑决策步骤',
        description: '批量编辑多个决策步骤',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '批量编辑成功' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, decision_draft_dto_1.BatchEditDecisionStepsDto]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "batchEditDecisionSteps", null);
__decorate([
    (0, common_1.Post)(':draftId/regenerate'),
    (0, swagger_1.ApiOperation)({
        summary: '局部重算',
        description: '根据用户的编辑操作，只重新生成受影响的决策步骤和步骤草案（非全量重生成）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '局部重算成功' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, decision_draft_dto_1.PartialRegenerateDto]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "partialRegenerate", null);
__decorate([
    (0, common_1.Put)(':draftId/steps/reorder'),
    (0, swagger_1.ApiOperation)({
        summary: '重新排序决策步骤',
        description: '重新排序决策步骤',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '重新排序成功' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, decision_draft_dto_1.ReorderDecisionStepsDto]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "reorderDecisionSteps", null);
__decorate([
    (0, common_1.Post)(':draftId/version'),
    (0, swagger_1.ApiOperation)({
        summary: '保存版本',
        description: '保存当前决策草案为版本',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '版本保存成功' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, decision_draft_dto_1.SaveVersionDto]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "saveVersion", null);
__decorate([
    (0, common_1.Post)(':draftId/version/:versionId/rollback'),
    (0, swagger_1.ApiOperation)({
        summary: '回滚版本',
        description: '回滚到指定版本',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '版本回滚成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '版本不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Param)('versionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "rollbackVersion", null);
__decorate([
    (0, common_1.Post)(':draftId/version/:versionId/fork'),
    (0, swagger_1.ApiOperation)({
        summary: 'Fork 版本',
        description: '基于指定版本创建新分支（生成新的 workflow_id）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Fork 成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '版本不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Param)('versionId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, decision_draft_dto_1.ForkVersionDto]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "forkVersion", null);
__decorate([
    (0, common_1.Get)(':draftId/debug-info'),
    (0, common_1.UseGuards)(studio_mode_guard_1.StudioModeGuard),
    (0, studio_mode_guard_1.RequireStudio)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取调试信息',
        description: '获取决策草案的完整调试信息（LLM Calls、Skill Calls、性能指标、执行追踪等），需要 Studio 权限',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '调试信息获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '需要 Studio 权限' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '决策草案不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "getDebugInfo", null);
__decorate([
    (0, common_1.Post)(':draftId/preview-impact'),
    (0, swagger_1.ApiOperation)({
        summary: '预览编辑影响',
        description: '预览对决策步骤的编辑会产生什么影响，包括受影响的步骤、预估变更等（不实际执行修改）',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '影响预览成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '决策草案不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "previewImpact", null);
__decorate([
    (0, common_1.Get)(':draftId/replay'),
    (0, swagger_1.ApiOperation)({
        summary: '获取决策回放数据',
        description: '获取决策草案的回放数据，用于前端决策可视化和回放功能',
    }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '回放数据获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '决策草案不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DecisionDraftController.prototype, "getReplayData", null);
exports.DecisionDraftController = DecisionDraftController = DecisionDraftController_1 = __decorate([
    (0, swagger_1.ApiTags)('Decision Draft'),
    (0, common_1.Controller)('decision-draft'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [decision_draft_generator_service_1.DecisionDraftGeneratorService,
        decision_explanation_service_1.DecisionExplanationService,
        decision_draft_version_service_1.DecisionDraftVersionService,
        decision_draft_storage_service_1.DecisionDraftStorageService,
        decision_draft_editor_service_1.DecisionDraftEditorService])
], DecisionDraftController);
//# sourceMappingURL=decision-draft.controller.js.map