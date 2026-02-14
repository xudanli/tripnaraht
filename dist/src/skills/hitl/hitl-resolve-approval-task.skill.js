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
var HitlResolveApprovalTaskSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HitlResolveApprovalTaskSkill = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const approval_service_1 = require("../../trips/decision/services/approval.service");
const decision_log_storage_service_1 = require("../../trips/decision/services/decision-log-storage.service");
let HitlResolveApprovalTaskSkill = HitlResolveApprovalTaskSkill_1 = class HitlResolveApprovalTaskSkill {
    constructor(moduleRef) {
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(HitlResolveApprovalTaskSkill_1.name);
        this.metadata = {
            name: 'hitl.resolveApprovalTask',
            description: '解决审批任务：approve/reject/feedback，和 decision logs 绑定',
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
                this.logger.warn('无法获取 ApprovalService，hitl.resolveApprovalTask 功能将不可用');
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
        this.logger.debug(`执行 hitl.resolveApprovalTask: taskId=${input.taskId}, action=${input.action}`);
        try {
            const approvalService = this.getApprovalService();
            if (!approvalService) {
                throw new Error('ApprovalService 未注入，无法解决审批任务');
            }
            const approval = await approvalService.checkStatus(input.taskId);
            if (!approval) {
                throw new Error(`审批任务 ${input.taskId} 不存在`);
            }
            if (approval.status !== 'PENDING') {
                const statusText = {
                    APPROVED: '已批准',
                    REJECTED: '已拒绝',
                    EXPIRED: '已过期',
                };
                throw new Error(`审批任务 ${input.taskId} 已处理：${statusText[approval.status] || approval.status}`);
            }
            const approved = input.action === 'approve';
            const decisionNote = input.feedback || (approved ? '已批准' : '已拒绝');
            await approvalService.handleDecision(input.taskId, {
                approved,
                decisionNote,
                userId: input.userId,
            });
            const payload = approval.payload;
            const metadata = approval.metadata;
            const decisionLogId = (payload === null || payload === void 0 ? void 0 : payload.decisionLogId) || (metadata === null || metadata === void 0 ? void 0 : metadata.decisionLogId);
            let decisionLogEntry;
            const decisionLogStorage = this.getDecisionLogStorage();
            if (decisionLogId && decisionLogStorage) {
                try {
                    const log = await decisionLogStorage.getLogById(decisionLogId);
                    if (log) {
                        const updatedMetadata = {
                            approvalResolved: true,
                            approvalResult: approved ? 'APPROVED' : 'REJECTED',
                            approvalFeedback: input.feedback,
                            approvalResolvedAt: new Date().toISOString(),
                        };
                        decisionLogEntry = await decisionLogStorage.updateLogMetadata(decisionLogId, updatedMetadata);
                        this.logger.debug(`已更新决策日志 ${decisionLogId} 的审批结果`);
                    }
                }
                catch (error) {
                    this.logger.warn(`更新决策日志失败: ${error.message}`);
                }
            }
            const nextActions = this.generateNextActions(input.action, approved, decisionLogId);
            const status = input.action === 'approve'
                ? 'APPROVED'
                : input.action === 'reject'
                    ? 'REJECTED'
                    : 'CHANGES_REQUESTED';
            return {
                taskId: input.taskId,
                status,
                resolvedAt: new Date().toISOString(),
                decisionLogEntry,
                nextActions,
                message: this.getStatusMessage(status, input.feedback),
            };
        }
        catch (error) {
            this.logger.error(`解决审批任务失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    generateNextActions(action, approved, decisionLogId) {
        const actions = [];
        if (approved) {
            actions.push('继续执行被批准的操作');
            if (decisionLogId) {
                actions.push(`查看决策日志 ${decisionLogId} 的详细信息`);
            }
        }
        else if (action === 'reject') {
            actions.push('考虑替代方案');
            actions.push('重新评估决策条件');
            if (decisionLogId) {
                actions.push(`查看决策日志 ${decisionLogId} 了解拒绝原因`);
            }
        }
        else if (action === 'request_changes') {
            actions.push('根据反馈修改操作参数');
            actions.push('重新提交审批请求');
        }
        return actions;
    }
    getStatusMessage(status, feedback) {
        const messages = {
            APPROVED: '审批已通过',
            REJECTED: '审批已拒绝',
            CHANGES_REQUESTED: '已请求修改',
        };
        const baseMessage = messages[status];
        return feedback ? `${baseMessage}：${feedback}` : baseMessage;
    }
};
exports.HitlResolveApprovalTaskSkill = HitlResolveApprovalTaskSkill;
exports.HitlResolveApprovalTaskSkill = HitlResolveApprovalTaskSkill = HitlResolveApprovalTaskSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.ModuleRef])
], HitlResolveApprovalTaskSkill);
//# sourceMappingURL=hitl-resolve-approval-task.skill.js.map