import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { LlmService } from '../../../llm/services/llm.service';
export interface PlanTransitSuggestModesInput extends SkillInput {
    from: {
        city: string;
        coordinates?: [number, number];
    };
    to: {
        city: string;
        coordinates?: [number, number];
    };
    date?: string;
}
export interface PlanTransitSuggestModesOutput extends SkillOutput {
    modes: Array<{
        mode: 'flight' | 'train' | 'bus' | 'self_drive' | 'other';
        time: number;
        cost: number;
        reliability: 'high' | 'medium' | 'low';
        effort: 'low' | 'medium' | 'high';
        recommendation: string;
        whyRecommended?: string;
        whyNotRecommended?: string;
    }>;
}
export declare class PlanTransitSuggestModesSkill implements Skill<PlanTransitSuggestModesInput, PlanTransitSuggestModesOutput> {
    private readonly llmService;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    constructor(llmService: LlmService);
    execute(input: PlanTransitSuggestModesInput): Promise<PlanTransitSuggestModesOutput>;
    private buildPrompt;
}
