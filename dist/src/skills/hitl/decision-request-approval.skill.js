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
var DecisionRequestApprovalSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionRequestApprovalSkill = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const skill_decorator_1 = require("../decorators/skill.decorator");
const approval_service_1 = require("../../trips/decision/services/approval.service");
let DecisionRequestApprovalSkill = DecisionRequestApprovalSkill_1 = class DecisionRequestApprovalSkill {
    constructor(moduleRef) {
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(DecisionRequestApprovalSkill_1.name);
        this.metadata = {
            name: 'decision.requestApproval',
            description: '请求用户审批高风险决策（Human-in-the-loop）。当 Agent 需要做出高风险决定时，挂起任务并等待用户确认',
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
        var _a, _b, _c;
        this.logger.log(`请求审批: ${input.action.type} (风险等级: ${input.riskLevel})`);
        if (input.dryRun) {
            this.logger.log('Dry Run 模式: 只验证参数，不执行实际操作');
            return {
                approvalId: 'dry-run',
                status: 'approved',
                message: 'Dry Run: 参数验证通过',
                userPrompt: {
                    title: 'Dry Run 模式',
                    description: '参数验证通过，但未执行实际操作',
                    action: input.action.description,
                    riskLevel: input.riskLevel,
                },
            };
        }
        const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
        if (expiresAt && expiresAt < new Date()) {
            return {
                _system_status: undefined,
                approvalId: 'expired',
                status: 'expired',
                message: '审批请求已过期',
                userPrompt: {
                    title: '审批请求已过期',
                    description: '此审批请求已过期，无法继续处理',
                    action: input.action.description,
                    riskLevel: input.riskLevel,
                },
            };
        }
        if (input.autoApproveAfter && input.riskLevel === 'low') {
            this.logger.log(`低风险操作将自动审批`);
            if (this.approvalService) {
                try {
                    await this.approvalService.createRequest({
                        threadId: input.threadId || 'unknown',
                        agentRunId: undefined,
                        toolCallId: input.toolCallId,
                        skillName: this.metadata.name,
                        summary: input.action.description,
                        description: (_a = input.context) === null || _a === void 0 ? void 0 : _a.decisionReason,
                        payload: input.action.details,
                        riskLevel: input.riskLevel,
                        expiresAt,
                        metadata: {
                            autoApproved: true,
                            userPrompt: this.generateUserPrompt(input),
                        },
                    });
                }
                catch (error) {
                    this.logger.warn(`创建审批记录失败（自动审批仍继续）: ${error.message}`);
                }
            }
            return {
                _system_status: undefined,
                approvalId: 'auto-approved',
                status: 'auto-approved',
                message: '低风险操作已自动审批',
                userPrompt: {
                    title: '操作已自动审批',
                    description: `低风险操作"${input.action.description}"已自动审批`,
                    action: input.action.description,
                    riskLevel: input.riskLevel,
                },
            };
        }
        const userPrompt = this.generateUserPrompt(input);
        let approvalId;
        const approvalService = this.getApprovalService();
        if (approvalService) {
            try {
                const request = await approvalService.createRequest({
                    threadId: input.threadId || 'unknown',
                    agentRunId: undefined,
                    toolCallId: input.toolCallId,
                    skillName: this.metadata.name,
                    summary: input.action.description,
                    description: (_b = input.context) === null || _b === void 0 ? void 0 : _b.decisionReason,
                    payload: input.action.details,
                    riskLevel: input.riskLevel,
                    expiresAt,
                    metadata: {
                        action: input.action,
                        context: input.context,
                        userPrompt,
                    },
                });
                approvalId = request.id;
            }
            catch (error) {
                this.logger.error(`创建审批请求失败: ${error.message}`, error.stack);
                throw new Error(`无法创建审批请求: ${error.message}`);
            }
        }
        else {
            this.logger.warn('⚠️  ApprovalService 未可用，使用内存存储（数据在重启后会丢失）');
            approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            global.__approvalStore = global.__approvalStore || new Map();
            global.__approvalStore.set(approvalId, {
                id: approvalId,
                threadId: input.threadId || 'unknown',
                toolCallId: input.toolCallId,
                skillName: this.metadata.name,
                payload: input.action.details,
                status: 'pending',
                createdAt: new Date(),
                expiresAt,
                userPrompt,
            });
        }
        return {
            _system_status: 'SUSPENDED',
            approvalId,
            status: 'pending',
            message: `I have created an approval request (ID: ${approvalId}) for user confirmation. I will wait for the user's decision before proceeding.`,
            userPrompt,
            requiresUserInput: true,
            suspendedTask: {
                taskId: approvalId,
                resumeAfter: 'user_approval',
                timeout: expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 1000) : undefined,
            },
            userUI: {
                type: 'approval_card',
                data: {
                    approvalId,
                    summary: input.action.description,
                    description: (_c = input.context) === null || _c === void 0 ? void 0 : _c.decisionReason,
                    riskLevel: input.riskLevel,
                    action: input.action,
                    context: input.context,
                },
            },
        };
    }
    generateUserPrompt(input) {
        var _a, _b, _c, _d;
        const riskLevelLabels = {
            low: '低风险',
            medium: '中等风险',
            high: '高风险',
            critical: '极高风险',
        };
        const buttons = [
            {
                label: '批准',
                action: 'approve',
                value: { approved: true },
            },
            {
                label: '拒绝',
                action: 'reject',
                value: { approved: false },
            },
        ];
        if (((_a = input.context) === null || _a === void 0 ? void 0 : _a.alternatives) && input.context.alternatives.length > 0) {
            buttons.push({
                label: '查看替代方案',
                action: 'modify',
                value: { showAlternatives: true },
            });
        }
        return {
            title: `需要您的审批: ${input.action.type}`,
            description: input.action.description,
            action: input.action.description,
            riskLevel: riskLevelLabels[input.riskLevel],
            context: {
                decisionReason: (_b = input.context) === null || _b === void 0 ? void 0 : _b.decisionReason,
                tripId: (_c = input.context) === null || _c === void 0 ? void 0 : _c.tripId,
                details: input.action.details,
            },
            alternatives: (_d = input.context) === null || _d === void 0 ? void 0 : _d.alternatives,
            buttons,
        };
    }
};
exports.DecisionRequestApprovalSkill = DecisionRequestApprovalSkill;
exports.DecisionRequestApprovalSkill = DecisionRequestApprovalSkill = DecisionRequestApprovalSkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'decision.requestApproval',
        description: '请求用户审批高风险决策（Human-in-the-loop）。当 Agent 需要做出高风险决定时，挂起任务并等待用户确认',
        version: '1.0.0',
        category: 'decision',
    }),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.ModuleRef])
], DecisionRequestApprovalSkill);
//# sourceMappingURL=decision-request-approval.skill.js.map