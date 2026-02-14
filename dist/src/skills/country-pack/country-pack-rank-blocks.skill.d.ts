import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { ContextBlock } from '../../agent/context-engine/types/context-package.types';
export interface CountryPackRankBlocksInput extends SkillInput {
    query: string;
    phase: string;
    intent?: string;
    blocks: ContextBlock[];
}
export interface CountryPackRankBlocksOutput extends SkillOutput {
    rankedBlocks: ContextBlock[];
    scores: Array<{
        key: string;
        score: number;
        reasons: string[];
    }>;
}
export declare class CountryPackRankBlocksSkill implements Skill<CountryPackRankBlocksInput, CountryPackRankBlocksOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "countryPack";
    };
    execute(input: CountryPackRankBlocksInput): Promise<CountryPackRankBlocksOutput>;
    private calculateRelevanceScore;
}
