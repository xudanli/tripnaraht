import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextPackage } from '../../agent/context-engine/types/context-package.types';
import { ContextLearnSkill } from './context-learn.skill';
export interface ContextBuildInput extends SkillInput {
    tripId?: string;
    phase: string;
    agent: string;
    userQuery: string;
    tokenBudget?: number;
    includePrivate?: boolean;
    requiredTopics?: string[];
    excludeTopics?: string[];
}
export interface ContextBuildOutput extends SkillOutput {
    contextPackage: ContextPackage;
}
export declare class ContextBuildSkill implements Skill<ContextBuildInput, ContextBuildOutput> {
    private readonly moduleRef;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
        toolGroup: "CONTEXT";
    };
    private contextEngineer?;
    private contextLearn?;
    constructor(moduleRef: ModuleRef, contextLearn?: ContextLearnSkill);
    private getContextEngineer;
    execute(input: ContextBuildInput): Promise<ContextBuildOutput>;
    private recordContextBuiltEvent;
}
