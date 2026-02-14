import { OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ApprovalRequest } from '../entities/approval-request.entity';
export declare class ApprovalStorageService implements OnModuleInit {
    private readonly prisma?;
    private readonly logger;
    private useDatabase;
    private readonly approvalStore;
    constructor(prisma?: PrismaService);
    onModuleInit(): Promise<void>;
    createApprovalRequest(request: ApprovalRequest): Promise<ApprovalRequest>;
    getApprovalRequest(id: string): Promise<ApprovalRequest | null>;
    updateApprovalRequest(id: string, updates: Partial<ApprovalRequest>): Promise<ApprovalRequest | null>;
    getPendingApprovalsByThreadId(threadId: string): Promise<ApprovalRequest[]>;
    handleApprovalResponse(id: string, approved: boolean, userFeedback?: string, userId?: string): Promise<ApprovalRequest | null>;
    private startExpirationCleanup;
    getAllApprovals(): ApprovalRequest[];
    private mapDbToEntity;
    private mapApprovalStatusToStatus;
    private mapStatusToApprovalStatus;
}
