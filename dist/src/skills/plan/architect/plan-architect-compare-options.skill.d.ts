import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanSkeleton, OptionComparison } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
export interface PlanArchitectCompareOptionsInput extends SkillInput {
    options: PlanSkeleton[];
    context?: any;
}
export interface PlanArchitectCompareOptionsOutput extends SkillOutput {
    comparison: OptionComparison;
}
export declare class PlanArchitectCompareOptionsSkill implements Skill<PlanArchitectCompareOptionsInput, PlanArchitectCompareOptionsOutput> {
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
    execute(input: PlanArchitectCompareOptionsInput): Promise<PlanArchitectCompareOptionsOutput>;
    private buildPrompt;
}
