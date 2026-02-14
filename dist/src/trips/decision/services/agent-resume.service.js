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
var AgentResumeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentResumeService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const approval_service_1 = require("./approval.service");
const client_1 = require("@prisma/client");
let AgentResumeService = AgentResumeService_1 = class AgentResumeService {
    constructor(prisma, approvalService) {
        this.prisma = prisma;
        this.approvalService = approvalService;
        this.logger = new common_1.Logger(AgentResumeService_1.name);
        this.agentStateStore = new Map();
    }
    async saveAgentState(threadId, snapshot) {
        this.agentStateStore.set(threadId, snapshot);
        this.logger.log(`保存 Agent 状态: threadId=${threadId}, messages=${snapshot.messages.length}`);
    }
    async loadAgentState(threadId) {
        const snapshot = this.agentStateStore.get(threadId);
        if (snapshot) {
            this.logger.log(`加载 Agent 状态: threadId=${threadId}, messages=${snapshot.messages.length}`);
            return snapshot;
        }
        return null;
    }
    async clearAgentState(threadId) {
        this.agentStateStore.delete(threadId);
        this.logger.log(`清除 Agent 状态: threadId=${threadId}`);
    }
    constructToolOutputMessage(toolCallId, approvalRequest) {
        const status = approvalRequest.status;
        if (status === client_1.ApprovalStatus.APPROVED) {
            return {
                role: 'tool',
                toolCallId,
                content: JSON.stringify({
                    status: 'APPROVED',
                    note: approvalRequest.decisionNote,
                    instruction: 'User has APPROVED this action. You may now proceed to execute the actual tool with the original parameters.',
                    originalPayload: approvalRequest.payload,
                }),
            };
        }
        else if (status === client_1.ApprovalStatus.REJECTED) {
            return {
                role: 'tool',
                toolCallId,
                content: JSON.stringify({
                    status: 'REJECTED',
                    note: approvalRequest.decisionNote,
                    instruction: 'User has REJECTED this action. You should not proceed with this operation. Consider alternative approaches or inform the user.',
                }),
            };
        }
        else if (status === client_1.ApprovalStatus.EXPIRED) {
            return {
                role: 'tool',
                toolCallId,
                content: JSON.stringify({
                    status: 'EXPIRED',
                    instruction: 'The approval request has EXPIRED. You should inform the user and ask if they still want to proceed, or suggest alternative actions.',
                }),
            };
        }
        return {
            role: 'tool',
            toolCallId,
            content: JSON.stringify({
                status,
                instruction: `The approval request status is ${status}. Please handle accordingly.`,
            }),
        };
    }
    async resumeAgent(threadId, approvalId) {
        const snapshot = await this.loadAgentState(threadId);
        if (!snapshot) {
            this.logger.warn(`未找到 Agent 状态: threadId=${threadId}`);
            return null;
        }
        if (!this.approvalService) {
            this.logger.error('ApprovalService 未可用，无法恢复 Agent');
            return null;
        }
        const approvalRequest = await this.approvalService.checkStatus(approvalId);
        if (!approvalRequest) {
            this.logger.warn(`审批请求不存在: ${approvalId}`);
            return null;
        }
        const toolCallId = approvalRequest.toolCallId || snapshot.lastToolCallId;
        if (!toolCallId) {
            this.logger.warn(`未找到 toolCallId，无法构造 Tool Output`);
            return null;
        }
        const toolOutputMessage = this.constructToolOutputMessage(toolCallId, approvalRequest);
        const updatedMessages = [...snapshot.messages, toolOutputMessage];
        const updatedSnapshot = {
            ...snapshot,
            messages: updatedMessages,
        };
        await this.saveAgentState(threadId, updatedSnapshot);
        this.logger.log(`Agent 已恢复: threadId=${threadId}, approvalId=${approvalId}, status=${approvalRequest.status}`);
        return updatedSnapshot;
    }
    detectSuspensionSignal(result) {
        return (result === null || result === void 0 ? void 0 : result._system_status) === 'SUSPENDED';
    }
    extractSuspensionInfo(result) {
        if (!this.detectSuspensionSignal(result)) {
            return null;
        }
        return {
            approvalId: result.approvalId,
            message: result.message,
            userUI: result.userUI,
        };
    }
};
exports.AgentResumeService = AgentResumeService;
exports.AgentResumeService = AgentResumeService = AgentResumeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        approval_service_1.ApprovalService])
], AgentResumeService);
//# sourceMappingURL=agent-resume.service.js.map