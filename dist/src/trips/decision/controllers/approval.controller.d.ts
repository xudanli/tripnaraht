import { ApprovalService } from '../services/approval.service';
import { AgentResumeService } from '../services/agent-resume.service';
import { TrajectoryCollectionService } from '../../../agent/training/services/trajectory-collection.service';
export declare class ApprovalController {
    private readonly approvalService;
    private readonly agentResumeService;
    private readonly trajectoryCollection?;
    private readonly logger;
    constructor(approvalService: ApprovalService, agentResumeService: AgentResumeService, trajectoryCollection?: TrajectoryCollectionService);
    getApproval(id: string): Promise<{
        status: import(".prisma/client").$Enums.ApprovalStatus;
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        summary: string;
        expiresAt: Date | null;
        riskLevel: string;
        threadId: string;
        agentRunId: string | null;
        toolCallId: string | null;
        skillName: string;
        payload: import("@prisma/client/runtime/library").JsonValue;
        decisionNote: string | null;
        handledAt: Date | null;
    }>;
    getPendingApprovals(threadId: string): Promise<{
        status: import(".prisma/client").$Enums.ApprovalStatus;
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        summary: string;
        expiresAt: Date | null;
        riskLevel: string;
        threadId: string;
        agentRunId: string | null;
        toolCallId: string | null;
        skillName: string;
        payload: import("@prisma/client/runtime/library").JsonValue;
        decisionNote: string | null;
        handledAt: Date | null;
    }[]>;
    handleDecision(id: string, body: {
        approved: boolean;
        decisionNote?: string;
        userId?: string;
        resumeAgent?: boolean;
    }): Promise<{
        success: boolean;
        approval: {
            status: import(".prisma/client").$Enums.ApprovalStatus;
            id: string;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            summary: string;
            expiresAt: Date | null;
            riskLevel: string;
            threadId: string;
            agentRunId: string | null;
            toolCallId: string | null;
            skillName: string;
            payload: import("@prisma/client/runtime/library").JsonValue;
            decisionNote: string | null;
            handledAt: Date | null;
        };
        agentResumed: boolean;
    }>;
    cancelApproval(id: string, body?: {
        reason?: string;
    }): Promise<{
        success: boolean;
        approval: {
            status: import(".prisma/client").$Enums.ApprovalStatus;
            id: string;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
            description: string | null;
            summary: string;
            expiresAt: Date | null;
            riskLevel: string;
            threadId: string;
            agentRunId: string | null;
            toolCallId: string | null;
            skillName: string;
            payload: import("@prisma/client/runtime/library").JsonValue;
            decisionNote: string | null;
            handledAt: Date | null;
        };
    }>;
    resumeAgent(id: string): Promise<{
        success: boolean;
        message: string;
        snapshot: {
            threadId: string;
            messageCount: number;
        };
    }>;
}
