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
var AgentRunnerWithHitlExample_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunnerWithHitlExample = void 0;
const common_1 = require("@nestjs/common");
const agent_resume_service_1 = require("../services/agent-resume.service");
let AgentRunnerWithHitlExample = AgentRunnerWithHitlExample_1 = class AgentRunnerWithHitlExample {
    constructor(agentResumeService) {
        this.agentResumeService = agentResumeService;
        this.logger = new common_1.Logger(AgentRunnerWithHitlExample_1.name);
    }
    async runAgentLoop(threadId, userMessage) {
        let messages = await this.loadMessageHistory(threadId);
        if (!messages) {
            messages = [
                {
                    role: 'system',
                    content: 'You are TripNARA travel planning assistant. Use tools when needed.',
                },
                {
                    role: 'user',
                    content: userMessage,
                },
            ];
        }
        const savedState = await this.agentResumeService.loadAgentState(threadId);
        if (savedState) {
            this.logger.log(`恢复之前的 Agent 状态: ${savedState.messages.length} 条消息`);
            messages = savedState.messages;
        }
        let maxIterations = 10;
        let iteration = 0;
        while (iteration < maxIterations) {
            iteration++;
            const llmResponse = await this.callLLM(messages);
            if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
                return {
                    role: 'assistant',
                    content: llmResponse.content,
                };
            }
            for (const toolCall of llmResponse.toolCalls) {
                const toolResult = await this.executeTool(toolCall);
                if (this.agentResumeService.detectSuspensionSignal(toolResult)) {
                    const suspensionInfo = this.agentResumeService.extractSuspensionInfo(toolResult);
                    if (!suspensionInfo) {
                        continue;
                    }
                    await this.agentResumeService.saveAgentState(threadId, {
                        threadId,
                        messages: [
                            ...messages,
                            {
                                role: 'assistant',
                                content: llmResponse.content,
                                toolCalls: llmResponse.toolCalls,
                            },
                            {
                                role: 'tool',
                                toolCallId: toolCall.id,
                                content: JSON.stringify(toolResult),
                            },
                        ],
                        lastToolCallId: toolCall.id,
                    });
                    return {
                        role: 'assistant',
                        content: suspensionInfo.message || '我需要您的确认才能继续...',
                        metadata: {
                            suspended: true,
                            approvalId: suspensionInfo.approvalId,
                            showApprovalUI: true,
                            userUI: suspensionInfo.userUI,
                        },
                    };
                }
                messages.push({
                    role: 'assistant',
                    content: llmResponse.content,
                    toolCalls: llmResponse.toolCalls,
                });
                messages.push({
                    role: 'tool',
                    toolCallId: toolCall.id,
                    content: JSON.stringify(toolResult),
                });
            }
        }
        return {
            role: 'assistant',
            content: '已达到最大迭代次数，请稍后重试。',
        };
    }
    async resumeAgentAfterApproval(threadId, approvalId) {
        const snapshot = await this.agentResumeService.resumeAgent(threadId, approvalId);
        if (!snapshot) {
            throw new Error('无法恢复 Agent 状态');
        }
        return this.runAgentLoop(threadId, '');
    }
    async loadMessageHistory(threadId) {
        return null;
    }
    async callLLM(messages) {
        throw new Error('需要实现 LLM 调用');
    }
    async executeTool(toolCall) {
        throw new Error('需要实现工具执行');
    }
};
exports.AgentRunnerWithHitlExample = AgentRunnerWithHitlExample;
exports.AgentRunnerWithHitlExample = AgentRunnerWithHitlExample = AgentRunnerWithHitlExample_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [agent_resume_service_1.AgentResumeService])
], AgentRunnerWithHitlExample);
//# sourceMappingURL=agent-runner-with-hitl.example.js.map