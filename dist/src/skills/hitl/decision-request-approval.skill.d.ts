import { ModuleRef } from '@nestjs/core';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
export interface DecisionRequestApprovalInput extends BaseSkillInput {
    threadId?: string;
    toolCallId?: string;
    action: {
        type: string;
        description: string;
        details: Record<string, any>;
    };
    context?: {
        tripId?: string;
        userId?: string;
        decisionReason?: string;
        alternatives?: Array<{
            option: string;
            description: string;
            pros?: string[];
            cons?: string[];
        }>;
    };
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    required?: boolean;
    expiresAt?: string;
    autoApproveAfter?: number;
}
export interface DecisionRequestApprovalOutput extends SkillOutput {
    _system_status?: 'SUSPENDED';
    approvalId: string;
    status: 'pending' | 'approved' | 'rejected' | 'expired' | 'auto-approved';
    message: string;
    userPrompt?: {
        title: string;
        description: string;
        action: string;
        riskLevel: string;
        context?: Record<string, any>;
        alternatives?: Array<{
            option: string;
            description: string;
            pros?: string[];
            cons?: string[];
        }>;
        buttons?: Array<{
            label: string;
            action: 'approve' | 'reject' | 'modify';
            value?: {
                approved?: boolean;
                showAlternatives?: boolean;
                [key: string]: any;
            };
        }>;
    };
    requiresUserInput?: boolean;
    suspendedTask?: {
        taskId: string;
        resumeAfter: 'user_approval' | 'user_rejection' | 'expiration';
        timeout?: number;
    };
    userUI?: {
        type: 'approval_card';
        data: any;
    };
}
export declare class DecisionRequestApprovalSkill implements Skill<DecisionRequestApprovalInput, DecisionRequestApprovalOutput> {
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
    execute(input: DecisionRequestApprovalInput): Promise<DecisionRequestApprovalOutput>;
    private generateUserPrompt;
}
