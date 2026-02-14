import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextPackage } from '../../agent/context-engine/types/context-package.types';
export interface ContextLearnInput extends SkillInput {
    userId?: string;
    tripId?: string;
    eventType: 'context_built' | 'context_used' | 'decision_made' | 'user_feedback';
    eventData: {
        contextPackage?: ContextPackage;
        usedBlocks?: string[];
        decisionResult?: {
            accepted: boolean;
            satisfaction?: number;
        };
        feedback?: {
            relevantBlocks?: string[];
            irrelevantBlocks?: string[];
            missingBlocks?: string[];
        };
    };
    phase?: string;
    agent?: string;
    userQuery?: string;
}
export interface ContextLearnOutput extends SkillOutput {
    learningResult: {
        updatedPriorities?: Record<string, number>;
        recommendedBlocks?: string[];
        confidence: number;
        sampleSize: number;
    };
}
export declare class ContextLearnSkill implements Skill<ContextLearnInput, ContextLearnOutput> {
    private readonly moduleRef;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
        toolGroup: "CONTEXT";
    };
    private contextLearningService?;
    constructor(moduleRef: ModuleRef);
    private getContextLearningService;
    execute(input: ContextLearnInput): Promise<ContextLearnOutput>;
}
