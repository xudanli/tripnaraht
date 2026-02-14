import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextPackage } from '../../agent/context-engine/types/context-package.types';
export interface ContextEvaluateInput extends SkillInput {
    contextPackage: ContextPackage;
    usedBlockKeys?: string[];
    userQuery?: string;
    phase?: string;
}
export interface ContextEvaluateOutput extends SkillOutput {
    metrics: {
        totalBlocks: number;
        publicBlocks: number;
        privateBlocks: number;
        usedBlocks?: number;
        hitRate?: number;
        noiseBlocks: number;
        noiseRate: number;
        totalTokens: number;
        tokenBudget: number;
        overBudgetRate: number;
        overBudget: boolean;
        compressedBlocks?: number;
        compressionRate?: number;
        relevanceScore?: number;
        blockTypeDistribution: Record<string, number>;
        priorityDistribution: {
            high: number;
            medium: number;
            low: number;
        };
    };
    summary: {
        quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
        issues: string[];
        suggestions: string[];
    };
}
export declare class ContextEvaluateSkill implements Skill<ContextEvaluateInput, ContextEvaluateOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
    };
    execute(input: ContextEvaluateInput): Promise<ContextEvaluateOutput>;
    private calculateRelevanceScore;
    private evaluateQuality;
}
