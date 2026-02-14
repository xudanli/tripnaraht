import { ModuleRef } from '@nestjs/core';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
export interface HitlResolveApprovalTaskInput extends BaseSkillInput {
    taskId: string;
    action: 'approve' | 'reject' | 'request_changes';
    feedback?: string;
    userId?: string;
}
export interface HitlResolveApprovalTaskOutput extends SkillOutput {
    taskId: string;
    status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
    resolvedAt: string;
    decisionLogEntry?: DecisionLogEntry;
    nextActions?: string[];
    message: string;
}
export declare class HitlResolveApprovalTaskSkill implements Skill<HitlResolveApprovalTaskInput, HitlResolveApprovalTaskOutput> {
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
    execute(input: HitlResolveApprovalTaskInput): Promise<HitlResolveApprovalTaskOutput>;
    private generateNextActions;
    private getStatusMessage;
}
