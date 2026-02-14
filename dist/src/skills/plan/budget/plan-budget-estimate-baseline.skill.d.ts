import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { BudgetBreakdown, PlanState } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
export interface PlanBudgetEstimateBaselineInput extends SkillInput {
    planState: PlanState;
    destination: {
        country?: string;
        city?: string;
    };
}
export interface PlanBudgetEstimateBaselineOutput extends SkillOutput {
    budgetBreakdown: BudgetBreakdown;
}
export declare class PlanBudgetEstimateBaselineSkill implements Skill<PlanBudgetEstimateBaselineInput, PlanBudgetEstimateBaselineOutput> {
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
    private extractJSON;
    execute(input: PlanBudgetEstimateBaselineInput): Promise<PlanBudgetEstimateBaselineOutput>;
    private buildPrompt;
    private getDefaultBudgetBreakdown;
}
