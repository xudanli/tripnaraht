import { ModuleRef } from '@nestjs/core';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
export interface HitlCreateApprovalTaskInput extends BaseSkillInput {
    taskType: 'DECISION_REJECT' | 'PLAN_REPLACEMENT' | 'RISK_CONFIRMATION' | 'CUSTOM';
    title: string;
    description: string;
    payload: {
        decisionLogId?: string;
        tripId?: string;
        routeDirectionId?: string;
        context: Record<string, any>;
    };
    options?: {
        required?: boolean;
        expiresAt?: string;
        notifyChannels?: string[];
        priority?: 'low' | 'medium' | 'high' | 'critical';
        riskLevel?: 'low' | 'medium' | 'high' | 'critical';
        threadId?: string;
        toolCallId?: string;
    };
}
export interface HitlCreateApprovalTaskOutput extends SkillOutput {
    taskId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
    message: string;
    userPrompt: string;
    approvalUrl?: string;
    expiresAt?: string;
    decisionLogId?: string;
}
export declare class HitlCreateApprovalTaskSkill implements Skill<HitlCreateApprovalTaskInput, HitlCreateApprovalTaskOutput> {
    private readonly moduleRef;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
    };
    private approvalService?;
    private decisionLogStorage?;
    constructor(moduleRef: ModuleRef);
    private getApprovalService;
    private getDecisionLogStorage;
    execute(input: HitlCreateApprovalTaskInput): Promise<HitlCreateApprovalTaskOutput>;
    private buildUserPrompt;
    private buildApprovalUrl;
}
