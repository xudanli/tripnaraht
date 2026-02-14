import { OnModuleInit } from '@nestjs/common';
import { ApprovalService } from '../services/approval.service';
export declare class ApprovalCleanupScheduler implements OnModuleInit {
    private readonly approvalService;
    private readonly logger;
    constructor(approvalService: ApprovalService);
    onModuleInit(): void;
    handleCleanup(): Promise<number>;
}
