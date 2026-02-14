import { Skill, SkillInput, SkillOutput, SkillMetadata } from '../../interfaces/skill.interface';
import { PlanState } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
export interface PlanBudgetProposeTradeoffsInput extends SkillInput {
    planState: PlanState;
    targetSavings: number;
}
export interface PlanBudgetProposeTradeoffsOutput extends SkillOutput {
    options: Array<{
        action: string;
        savings: number;
        sacrifice: string;
        impact: {
            pace?: string;
            experience?: string;
            risk?: string;
        };
    }>;
}
export declare class PlanBudgetProposeTradeoffsSkill implements Skill<PlanBudgetProposeTradeoffsInput, PlanBudgetProposeTradeoffsOutput> {
    private readonly llmService;
    private readonly logger;
    metadata: SkillMetadata;
    constructor(llmService: LlmService);
    execute(input: PlanBudgetProposeTradeoffsInput): Promise<PlanBudgetProposeTradeoffsOutput>;
    private buildPrompt;
}
