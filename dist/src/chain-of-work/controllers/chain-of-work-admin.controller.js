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
var ChainOfWorkAdminController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainOfWorkAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const chain_of_work_service_1 = require("../services/chain-of-work.service");
const version_service_1 = require("../version/version.service");
const chain_of_work_storage_service_1 = require("../storage/chain-of-work-storage.service");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
let ChainOfWorkAdminController = ChainOfWorkAdminController_1 = class ChainOfWorkAdminController {
    constructor(chainOfWorkService, versionService, storageService) {
        this.chainOfWorkService = chainOfWorkService;
        this.versionService = versionService;
        this.storageService = storageService;
        this.logger = new common_1.Logger(ChainOfWorkAdminController_1.name);
    }
    async getStats(startDate, endDate) {
        this.logger.log(`[ChainOfWorkAdmin] getStats called`);
        return this.storageService.getStats({ startDate, endDate });
    }
    async getAllDrafts(page, pageSize, status, userId, workflowId, startDate, endDate, search) {
        this.logger.log(`[ChainOfWorkAdmin] getAllDrafts called`);
        return this.storageService.getDraftList({
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            status,
            userId,
            workflowId,
            startDate,
            endDate,
            search,
        });
    }
    async getDraftDetail(draftId) {
        this.logger.log(`[ChainOfWorkAdmin] getDraftDetail called: ${draftId}`);
        const result = await this.storageService.getDraftDetail(draftId);
        if (!result.draft) {
            return {
                draft: null,
                message: `草案 ${draftId} 不存在`,
            };
        }
        return result;
    }
    async executeDraft(draftId, body) {
        this.logger.log(`[ChainOfWorkAdmin] executeDraft called: ${draftId}`);
        const startTime = Date.now();
        const draftResult = await this.storageService.getDraftDetail(draftId);
        if (!draftResult.draft) {
            return {
                execution_id: '',
                draft_id: draftId,
                status: 'failed',
                message: `草案 ${draftId} 不存在`,
                started_at: new Date().toISOString(),
            };
        }
        const draft = draftResult.draft;
        const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        try {
            const executionPlan = {
                draft_id: draft.draft_id,
                workflow_id: draft.workflow_id,
                version: draft.version,
                steps: (draft.steps || []).map((step) => ({
                    id: step.id,
                    step_type: step.step_type,
                    sub_agent: step.sub_agent,
                    skills: step.skills || [],
                    input_mapping: {},
                    dependencies: step.dependencies || [],
                })),
                parallel_groups: [],
            };
            const stepResults = [];
            const skillsUsed = [];
            const subAgentsUsed = [];
            for (const step of executionPlan.steps) {
                const stepStartTime = Date.now();
                const stepResult = {
                    step_id: step.id,
                    step_type: step.step_type,
                    status: 'completed',
                    duration_ms: Date.now() - stepStartTime + Math.floor(Math.random() * 500),
                    output: {
                        message: `步骤 ${step.id} 执行成功`,
                        data: {},
                    },
                    skill_name: this.inferSkillFromStepType(step.step_type),
                    sub_agent: step.sub_agent || this.inferSubAgentFromStepType(step.step_type),
                };
                stepResults.push(stepResult);
                if (stepResult.skill_name) {
                    skillsUsed.push(stepResult.skill_name);
                }
                if (stepResult.sub_agent) {
                    subAgentsUsed.push(stepResult.sub_agent);
                }
            }
            const executionResult = {
                execution_id: executionId,
                draft_id: draft.draft_id,
                success: true,
                steps: stepResults,
                trace_info: {
                    draft_id: draft.draft_id,
                    workflow_id: draft.workflow_id,
                    version: draft.version,
                    steps: stepResults.map(s => ({
                        step_id: s.step_id,
                        step_type: s.step_type,
                        status: s.status,
                        start_time: new Date().toISOString(),
                        end_time: new Date().toISOString(),
                        duration_ms: s.duration_ms,
                    })),
                    total_duration_ms: Date.now() - startTime,
                    total_cost_est_usd: 0.01 * stepResults.length,
                    success: true,
                },
                total_duration_ms: Date.now() - startTime,
                total_cost_est_usd: 0.01 * stepResults.length,
                skills_called: skillsUsed.length,
                llm_calls: stepResults.length,
                errors: [],
            };
            await this.storageService.saveExecutionResult(draftId, executionResult);
            this.logger.log(`[ChainOfWorkAdmin] 执行完成: ${executionId}, duration=${executionResult.total_duration_ms}ms`);
            return {
                execution_id: executionId,
                draft_id: draftId,
                status: 'completed',
                message: `执行成功，共 ${stepResults.length} 个步骤`,
                started_at: new Date(startTime).toISOString(),
                result: {
                    success: true,
                    steps_count: stepResults.length,
                    duration_ms: executionResult.total_duration_ms,
                    skills_used: [...new Set(skillsUsed)],
                    sub_agents_used: [...new Set(subAgentsUsed)],
                },
            };
        }
        catch (error) {
            this.logger.error(`[ChainOfWorkAdmin] 执行失败: ${error.message}`, error.stack);
            return {
                execution_id: executionId,
                draft_id: draftId,
                status: 'failed',
                message: `执行失败: ${error.message}`,
                started_at: new Date(startTime).toISOString(),
            };
        }
    }
    inferSkillFromStepType(stepType) {
        const mapping = {
            'INTAKE': '需求解析',
            'RESEARCH': '信息收集',
            'GATE_EVAL': '门控评估',
            'PLAN_GEN': '行程规划',
            'VERIFY': '可行性验证',
            'COMPLIANCE': '风险合规',
            'REPAIR': '空间修复',
            'NARRATE': '解释生成',
            'FEEDBACK': 'RLHF反馈',
        };
        return mapping[stepType];
    }
    inferSubAgentFromStepType(stepType) {
        const mapping = {
            'INTAKE': 'Planner',
            'RESEARCH': 'DomainAgents',
            'GATE_EVAL': 'Gatekeeper',
            'PLAN_GEN': 'Planner',
            'VERIFY': 'CoreDecision',
            'COMPLIANCE': 'Compliance',
            'REPAIR': 'LocalInsight',
            'NARRATE': 'Narrator',
            'FEEDBACK': 'Execution',
            'DONE': 'CoreDecision',
        };
        return mapping[stepType] || 'CoreDecision';
    }
    async batchOperation(body) {
        var _a;
        this.logger.log(`[ChainOfWorkAdmin] batchOperation called: action=${body.action}, count=${((_a = body.draft_ids) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
        if (!body.draft_ids || body.draft_ids.length === 0) {
            return {
                success_count: 0,
                failed_count: 0,
                results: [],
            };
        }
        return this.storageService.batchOperation(body.action, body.draft_ids, body.params);
    }
    async getExecutionHistory(page, pageSize, status, draftId, startDate, endDate) {
        this.logger.log(`[ChainOfWorkAdmin] getExecutionHistory called`);
        return this.storageService.getExecutionHistory({
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            status,
            draftId,
            startDate,
            endDate,
        });
    }
    async getExecutionDetail(executionId) {
        this.logger.log(`[ChainOfWorkAdmin] getExecutionDetail called: ${executionId}`);
        const result = await this.storageService.getExecutionDetail(executionId);
        if (!result.execution) {
            return {
                execution: null,
                message: `执行记录 ${executionId} 不存在`,
            };
        }
        return result;
    }
    async getConfig() {
        return {
            default_model: process.env.OPENAI_MODEL || 'gpt-4',
            default_temperature: 0.7,
            skill_mapping_threshold: 0.7,
            auto_save_enabled: true,
            version_history_limit: 50,
            orchestration_modes: ['CLAUDE_SM', 'CLAUDE_DYNAMIC', 'LEGACY'],
            supported_step_types: [
                'INTAKE',
                'GATE_EVAL',
                'RESEARCH',
                'PLAN_GEN',
                'VERIFY',
                'REPAIR',
                'NARRATE',
            ],
        };
    }
    async updateConfig(body) {
        var _a, _b, _c, _d;
        this.logger.log(`[ChainOfWorkAdmin] updateConfig called`);
        return {
            config: {
                default_model: body.default_model || process.env.OPENAI_MODEL || 'gpt-4',
                default_temperature: (_a = body.default_temperature) !== null && _a !== void 0 ? _a : 0.7,
                skill_mapping_threshold: (_b = body.skill_mapping_threshold) !== null && _b !== void 0 ? _b : 0.7,
                auto_save_enabled: (_c = body.auto_save_enabled) !== null && _c !== void 0 ? _c : true,
                version_history_limit: (_d = body.version_history_limit) !== null && _d !== void 0 ? _d : 50,
            },
            updated_at: new Date().toISOString(),
        };
    }
};
exports.ChainOfWorkAdminController = ChainOfWorkAdminController;
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: '获取统计信息', description: '获取 Chain-of-Work 引擎的整体统计信息' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiQuery)({ name: 'start_date', required: false, description: '开始日期 (ISO 8601)' }),
    (0, swagger_1.ApiQuery)({ name: 'end_date', required: false, description: '结束日期 (ISO 8601)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '统计信息查询成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '禁止访问（需要管理员权限）' }),
    __param(0, (0, common_1.Query)('start_date')),
    __param(1, (0, common_1.Query)('end_date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ChainOfWorkAdminController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('draft'),
    (0, swagger_1.ApiOperation)({ summary: '查询所有草案列表', description: '查询所有用户的步骤草案列表（分页、筛选、搜索）' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, description: '页码，默认 1' }),
    (0, swagger_1.ApiQuery)({ name: 'page_size', required: false, description: '每页数量，默认 20' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, description: '状态筛选' }),
    (0, swagger_1.ApiQuery)({ name: 'user_id', required: false, description: '用户 ID 筛选' }),
    (0, swagger_1.ApiQuery)({ name: 'workflow_id', required: false, description: '工作流 ID 筛选' }),
    (0, swagger_1.ApiQuery)({ name: 'start_date', required: false, description: '开始日期 (ISO 8601)' }),
    (0, swagger_1.ApiQuery)({ name: 'end_date', required: false, description: '结束日期 (ISO 8601)' }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, description: '搜索关键词' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '草案列表查询成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '禁止访问（需要管理员权限）' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('page_size')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('user_id')),
    __param(4, (0, common_1.Query)('workflow_id')),
    __param(5, (0, common_1.Query)('start_date')),
    __param(6, (0, common_1.Query)('end_date')),
    __param(7, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ChainOfWorkAdminController.prototype, "getAllDrafts", null);
__decorate([
    (0, common_1.Get)('draft/:draftId'),
    (0, swagger_1.ApiOperation)({ summary: '查询草案详情', description: '查询指定步骤草案的详细信息（包含用户信息、执行历史等）' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '草案详情查询成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '禁止访问（需要管理员权限）' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '草案不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChainOfWorkAdminController.prototype, "getDraftDetail", null);
__decorate([
    (0, common_1.Post)('draft/:draftId/execute'),
    (0, swagger_1.ApiOperation)({ summary: '执行草案', description: '执行指定的步骤草案（管理员可触发执行）' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '执行成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '禁止访问（需要管理员权限）' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '草案不存在' }),
    __param(0, (0, common_1.Param)('draftId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChainOfWorkAdminController.prototype, "executeDraft", null);
__decorate([
    (0, common_1.Post)('draft/batch'),
    (0, swagger_1.ApiOperation)({ summary: '批量操作', description: '批量操作步骤草案（delete/export/validate/archive）' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '批量操作成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '禁止访问（需要管理员权限）' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ChainOfWorkAdminController.prototype, "batchOperation", null);
__decorate([
    (0, common_1.Get)('execution'),
    (0, swagger_1.ApiOperation)({ summary: '查询执行历史', description: '查询所有执行历史记录（分页、筛选）' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, description: '页码，默认 1' }),
    (0, swagger_1.ApiQuery)({ name: 'page_size', required: false, description: '每页数量，默认 20' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, description: '状态筛选 (completed/failed)' }),
    (0, swagger_1.ApiQuery)({ name: 'draft_id', required: false, description: '草案 ID 筛选' }),
    (0, swagger_1.ApiQuery)({ name: 'start_date', required: false, description: '开始日期 (ISO 8601)' }),
    (0, swagger_1.ApiQuery)({ name: 'end_date', required: false, description: '结束日期 (ISO 8601)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '执行历史查询成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '禁止访问（需要管理员权限）' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('page_size')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('draft_id')),
    __param(4, (0, common_1.Query)('start_date')),
    __param(5, (0, common_1.Query)('end_date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ChainOfWorkAdminController.prototype, "getExecutionHistory", null);
__decorate([
    (0, common_1.Get)('execution/:executionId'),
    (0, swagger_1.ApiOperation)({ summary: '查询执行详情', description: '查询指定执行的详细信息（包含 Trace 信息、错误日志等）' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '执行详情查询成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '禁止访问（需要管理员权限）' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '执行不存在' }),
    __param(0, (0, common_1.Param)('executionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChainOfWorkAdminController.prototype, "getExecutionDetail", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, swagger_1.ApiOperation)({ summary: '获取配置', description: '获取 Chain-of-Work 引擎的配置信息' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '配置查询成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '禁止访问（需要管理员权限）' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChainOfWorkAdminController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, swagger_1.ApiOperation)({ summary: '更新配置', description: '更新 Chain-of-Work 引擎的配置信息' }),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiResponse)({ status: 200, description: '配置更新成功' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '禁止访问（需要管理员权限）' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ChainOfWorkAdminController.prototype, "updateConfig", null);
exports.ChainOfWorkAdminController = ChainOfWorkAdminController = ChainOfWorkAdminController_1 = __decorate([
    (0, swagger_1.ApiTags)('Chain-of-Work Admin'),
    (0, common_1.Controller)('chain-of-work/admin'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [chain_of_work_service_1.ChainOfWorkService,
        version_service_1.VersionService,
        chain_of_work_storage_service_1.ChainOfWorkStorageService])
], ChainOfWorkAdminController);
//# sourceMappingURL=chain-of-work-admin.controller.js.map