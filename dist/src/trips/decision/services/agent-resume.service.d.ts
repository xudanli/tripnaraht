import { PrismaService } from '../../../prisma/prisma.service';
import { ApprovalService } from './approval.service';
import { ApprovalStatus } from '@prisma/client';
export interface AgentStateSnapshot {
    threadId: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant' | 'tool';
        content?: string;
        toolCallId?: string;
        toolCalls?: Array<{
            id: string;
            type: 'function';
            function: {
                name: string;
                arguments: string;
            };
        }>;
    }>;
    lastToolCallId?: string;
    metadata?: any;
}
export declare class AgentResumeService {
    private readonly prisma?;
    private readonly approvalService?;
    private readonly logger;
    private readonly agentStateStore;
    constructor(prisma?: PrismaService, approvalService?: ApprovalService);
    saveAgentState(threadId: string, snapshot: AgentStateSnapshot): Promise<void>;
    loadAgentState(threadId: string): Promise<AgentStateSnapshot | null>;
    clearAgentState(threadId: string): Promise<void>;
    constructToolOutputMessage(toolCallId: string, approvalRequest: {
        status: ApprovalStatus;
        decisionNote?: string | null;
        payload?: any;
    }): AgentStateSnapshot['messages'][0];
    resumeAgent(threadId: string, approvalId: string): Promise<AgentStateSnapshot | null>;
    detectSuspensionSignal(result: any): boolean;
    extractSuspensionInfo(result: any): {
        approvalId: string;
        message: string;
        userUI?: any;
    } | null;
}
