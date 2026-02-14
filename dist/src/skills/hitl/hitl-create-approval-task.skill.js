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
var HitlCreateApprovalTaskSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HitlCreateApprovalTaskSkill = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const approval_service_1 = require("../../trips/decision/services/approval.service");
const decision_log_storage_service_1 = require("../../trips/decision/services/decision-log-storage.service");
let HitlCreateApprovalTaskSkill = HitlCreateApprovalTaskSkill_1 = class HitlCreateApprovalTaskSkill {
    constructor(moduleRef) {
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(HitlCreateApprovalTaskSkill_1.name);
        this.metadata = {
            name: 'hitl.createApprovalTask',
            description: '创建审批任务：输出 task_id + payload，支持多种审批类型，与 Decision Logs 绑定',
            version: '1.0.0',
            category: 'decision',
        };
    }
    getApprovalService() {
        if (!this.approvalService) {
            try {
                this.approvalService = this.moduleRef.get(approval_service_1.ApprovalService, { strict: false });
            }
            catch (error) {
                this.logger.warn('无法获取 ApprovalService，hitl.createApprovalTask 功能将不可用');
                return null;
            }
        }
        return this.approvalService || null;
    }
    getDecisionLogStorage() {
        if (!this.decisionLogStorage) {
            try {
                this.decisionLogStorage = this.moduleRef.get(decision_log_storage_service_1.DecisionLogStorageService, { strict: false });
            }
            catch (error) {
                return null;
            }
        }
        return this.decisionLogStorage || null;
    }
    async execute(input) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this.logger.debug(`执行 hitl.createApprovalTask: taskType=${input.taskType}, title=${input.title}`);
        try {
            const approvalService = this.getApprovalService();
            if (!approvalService) {
                throw new Error('ApprovalService 未注入，无法创建审批任务');
            }
            let decisionLogId = input.payload.decisionLogId;
            const decisionLogStorage = this.getDecisionLogStorage();
            if (decisionLogId && decisionLogStorage) {
                try {
                    const log = await decisionLogStorage.getLogById(decisionLogId);
                    if (!log) {
                        this.logger.warn(`决策日志 ${decisionLogId} 不存在，将创建无关联的审批任务`);
                        decisionLogId = undefined;
                    }
                    else {
                        this.logger.debug(`已验证决策日志 ${decisionLogId} 存在`);
                    }
                }
                catch (error) {
                    this.logger.warn(`验证决策日志失败: ${error.message}，将创建无关联的审批任务`);
                    decisionLogId = undefined;
                }
            }
            const riskLevel = ((_a = input.options) === null || _a === void 0 ? void 0 : _a.riskLevel) || 'medium';
            const expiresAt = ((_b = input.options) === null || _b === void 0 ? void 0 : _b.expiresAt)
                ? new Date(input.options.expiresAt)
                : new Date(Date.now() + 24 * 60 * 60 * 1000);
            const approvalData = {
                threadId: ((_c = input.options) === null || _c === void 0 ? void 0 : _c.threadId) || 'unknown',
                toolCallId: (_d = input.options) === null || _d === void 0 ? void 0 : _d.toolCallId,
                skillName: this.metadata.name,
                summary: input.title,
                description: input.description,
                payload: {
                    ...input.payload.context,
                    decisionLogId,
                    tripId: input.payload.tripId,
                    routeDirectionId: input.payload.routeDirectionId,
                    taskType: input.taskType,
                },
                riskLevel,
                expiresAt,
                metadata: {
                    taskType: input.taskType,
                    required: ((_e = input.options) === null || _e === void 0 ? void 0 : _e.required) !== false,
                    priority: ((_f = input.options) === null || _f === void 0 ? void 0 : _f.priority) || 'medium',
                    notifyChannels: ((_g = input.options) === null || _g === void 0 ? void 0 : _g.notifyChannels) || [],
                },
            };
            const approvalResult = await approvalService.createRequest(approvalData);
            if (decisionLogId && decisionLogStorage) {
                try {
                    const log = await decisionLogStorage.getLogById(decisionLogId);
                    if (log) {
                        const updatedMetadata = {
                            approvalTaskId: approvalResult.id,
                            approvalTaskType: input.taskType,
                            approvalTaskCreatedAt: new Date().toISOString(),
                        };
                        await decisionLogStorage.updateLogMetadata(decisionLogId, updatedMetadata);
                        this.logger.debug(`已关联审批任务 ${approvalResult.id} 到决策日志 ${decisionLogId}`);
                    }
                }
                catch (error) {
                    this.logger.warn(`更新决策日志失败: ${error.message}`);
                }
            }
            const userPrompt = this.buildUserPrompt(input, approvalResult.id);
            const approvalUrl = this.buildApprovalUrl(approvalResult.id);
            return {
                taskId: approvalResult.id,
                status: 'PENDING',
                message: '审批任务已创建',
                userPrompt,
                approvalUrl,
                expiresAt: (_h = approvalResult.expiresAt) === null || _h === void 0 ? void 0 : _h.toISOString(),
                decisionLogId,
            };
        }
        catch (error) {
            this.logger.error(`创建审批任务失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    buildUserPrompt(input, taskId) {
        var _a, _b;
        const riskLevelText = {
            low: '低风险',
            medium: '中等风险',
            high: '高风险',
            critical: '严重风险',
        };
        const riskText = riskLevelText[((_a = input.options) === null || _a === void 0 ? void 0 : _a.riskLevel) || 'medium'];
        const requiredText = ((_b = input.options) === null || _b === void 0 ? void 0 : _b.required) !== false ? '（必需）' : '（可选）';
        return `${input.title}${requiredText}\n\n${input.description}\n\n风险等级：${riskText}\n任务 ID：${taskId}`;
    }
    buildApprovalUrl(taskId) {
        const baseUrl = process.env.APP_BASE_URL ||
            process.env.FRONTEND_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            'https://app.tripnara.com';
        const approvalPath = process.env.APPROVAL_PATH_PATTERN || '/approvals';
        const url = `${baseUrl}${approvalPath}/${taskId}`;
        this.logger.debug(`构建审批 URL: ${url}`);
        return url;
    }
};
exports.HitlCreateApprovalTaskSkill = HitlCreateApprovalTaskSkill;
exports.HitlCreateApprovalTaskSkill = HitlCreateApprovalTaskSkill = HitlCreateApprovalTaskSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.ModuleRef])
], HitlCreateApprovalTaskSkill);
//# sourceMappingURL=hitl-create-approval-task.skill.js.map