import { ModuleRef } from '@nestjs/core';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
export interface DecisionCheckApprovalInput extends BaseSkillInput {
    approvalId: string;
}
export interface DecisionCheckApprovalOutput extends SkillOutput {
    status: 'pending' | 'approved' | 'rejected' | 'expired' | 'not_found';
    result?: {
        approved: boolean;
        timestamp: string;
        userFeedback?: string;
    };
    message: string;
}
export declare class DecisionCheckApprovalSkill implements Skill<DecisionCheckApprovalInput, DecisionCheckApprovalOutput> {
    private readonly moduleRef;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
    };
    private approvalService?;
    constructor(moduleRef: ModuleRef);
    private getApprovalService;
    execute(input: DecisionCheckApprovalInput): Promise<DecisionCheckApprovalOutput>;
    private getStatusMessage;
}
