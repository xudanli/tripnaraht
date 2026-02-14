import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, ConflictDetection } from '../shared/plan-state.types';
import { LlmService } from '../../../llm/services/llm.service';
export interface PlanConstraintsArbitrateTradeoffsInput extends SkillInput {
    planState: PlanState;
    conflicts: ConflictDetection;
}
export interface PlanConstraintsArbitrateTradeoffsOutput extends SkillOutput {
    recommendedResolution: {
        action: string;
        description: string;
        impact: string;
    };
    options: Array<{
        action: string;
        description: string;
        impact: string;
    }>;
    userConfirmationRequired: boolean;
}
export declare class PlanConstraintsArbitrateTradeoffsSkill implements Skill<PlanConstraintsArbitrateTradeoffsInput, PlanConstraintsArbitrateTradeoffsOutput> {
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
    execute(input: PlanConstraintsArbitrateTradeoffsInput): Promise<PlanConstraintsArbitrateTradeoffsOutput>;
    private buildPrompt;
}
