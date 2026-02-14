import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextBlock } from '../../agent/context-engine/types/context-package.types';
export interface ContextCompressInput extends SkillInput {
    blocks: ContextBlock[];
    tokenBudget: number;
    strategy?: 'aggressive' | 'conservative' | 'balanced';
    preserveKeys?: string[];
}
export interface ContextCompressOutput extends SkillOutput {
    compressedBlocks: ContextBlock[];
    stats: {
        originalBlocks: number;
        compressedBlocks: number;
        originalTokens: number;
        compressedTokens: number;
        reductionRatio: number;
        removedKeys: string[];
    };
}
export declare class ContextCompressSkill implements Skill<ContextCompressInput, ContextCompressOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
    };
    execute(input: ContextCompressInput): Promise<ContextCompressOutput>;
    private categorizeBlocks;
    private compressAggressive;
    private compressConservative;
    private compressBalanced;
    private summarizeBlock;
    private extractKeyInfo;
    private estimateTokens;
    private willFit;
}
