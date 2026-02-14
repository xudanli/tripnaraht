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
var DecisionCheckApprovalSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionCheckApprovalSkill = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const skill_decorator_1 = require("../decorators/skill.decorator");
const approval_service_1 = require("../../trips/decision/services/approval.service");
let DecisionCheckApprovalSkill = DecisionCheckApprovalSkill_1 = class DecisionCheckApprovalSkill {
    constructor(moduleRef) {
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(DecisionCheckApprovalSkill_1.name);
        this.metadata = {
            name: 'decision.checkApproval',
            description: '检查审批请求的状态',
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
                return null;
            }
        }
        return this.approvalService || null;
    }
    async execute(input) {
        this.logger.log(`检查审批状态: ${input.approvalId}`);
        if (input.dryRun) {
            return {
                status: 'pending',
                message: 'Dry Run: 参数验证通过',
            };
        }
        const approvalService = this.getApprovalService();
        if (!approvalService) {
            return {
                status: 'not_found',
                message: 'ApprovalService 未可用',
            };
        }
        const approval = await approvalService.checkStatus(input.approvalId);
        if (!approval) {
            return {
                status: 'not_found',
                message: '未找到审批请求',
            };
        }
        const status = approval.status.toLowerCase();
        const metadata = approval.metadata || {};
        const result = approval.handledAt
            ? {
                approved: status === 'approved',
                timestamp: approval.handledAt.toISOString(),
                userFeedback: approval.decisionNote || undefined,
            }
            : undefined;
        return {
            status,
            result,
            message: this.getStatusMessage(status),
        };
    }
    getStatusMessage(status) {
        const messages = {
            pending: '审批请求待处理',
            approved: '审批已通过',
            rejected: '审批已拒绝',
            expired: '审批请求已过期',
            not_found: '未找到审批请求',
        };
        return messages[status] || '未知状态';
    }
};
exports.DecisionCheckApprovalSkill = DecisionCheckApprovalSkill;
exports.DecisionCheckApprovalSkill = DecisionCheckApprovalSkill = DecisionCheckApprovalSkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'decision.checkApproval',
        description: '检查审批请求的状态',
        version: '1.0.0',
        category: 'decision',
    }),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.ModuleRef])
], DecisionCheckApprovalSkill);
//# sourceMappingURL=decision-check-approval.skill.js.map